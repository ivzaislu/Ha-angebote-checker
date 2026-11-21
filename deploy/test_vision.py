import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zlib

spec = importlib.util.spec_from_file_location("angebote_vision", Path(__file__).with_name("vision.py"))
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)


def png_fixture():
    """Pipeline fixture, not a product-recognition accuracy benchmark."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    pixels = b"".join(b"\0" + b"\xff\0\0" * 32 for _ in range(32))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB",32,32,8,2,0,0,0)) + chunk(b"IDAT",zlib.compress(pixels)) + chunk(b"IEND",b"")


class VisionTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("VISION_POSTGRES_TEST")=="1" and os.environ.get("GITHUB_ACTIONS")=="true", "CI-only isolated PostgreSQL sampler check")
    def test_sample_sql_against_real_postgres(self):
        import subprocess
        command=["docker","exec","-i","angebote-vision-sample-ci","psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","vision","-d","vision"]
        fixture="""
        CREATE TABLE offer_archive (offer_id text,name text,category text,description text,country text,observed_at timestamptz DEFAULT now());
        INSERT INTO offer_archive(offer_id,name,category,description,country) VALUES
          ('25768762','Creme','Gesichtspflege','200 ml','de'),
          ('999','Other cream','Gesichtspflege','100 ml','de'),
          ('200','Original','Milch','6 x 65 ml','de'),
          ('300','Tafeläpfel XXL','Äpfel','5 kg','de'),
          ('400','Kolanda','Kaffee','ganze Bohnen','de'),
          ('500','Lachsfiletportionen','Tiefkühlfisch','120 g','de'),
          ('bad','Creme','Gesichtspflege','100 ml','de'),
          ('700','Original','Milch','not Germany','at');
        """
        subprocess.run(command,input=fixture,text=True,check=True,capture_output=True)
        readonly=command[:3]+["-e","PGOPTIONS=-c default_transaction_read_only=on"]+command[3:]
        result=subprocess.run(readonly,input=vision.ARCHIVE_SAMPLE_SQL,text=True,check=True,capture_output=True)
        rows=json.loads(result.stdout)
        self.assertEqual([row["offer_id"] for row in rows],["25768762","200","300","400","500"])
        refused=subprocess.run(readonly,input="CREATE TABLE forbidden_write(id int);",text=True,capture_output=True)
        self.assertNotEqual(refused.returncode,0)

    def test_type_task_uses_no_brand_reading_and_disables_prompt_cache(self):
        request=vision.pixel_request(png_fixture(),"type")
        self.assertEqual(request["messages"][0]["content"][1]["text"],vision.TYPE_PROMPT)
        self.assertEqual(request["max_tokens"],32)
        self.assertIs(request["cache_prompt"],False)
        self.assertNotIn("Gesichtspflege",json.dumps(request))
        with self.assertRaises(ValueError):
            vision.pixel_request(png_fixture(),"unknown")

    def test_repeats_share_pixels_without_repeating_download_or_conversion(self):
        with patch.object(vision,"container_id",return_value="container"), \
             patch.object(vision,"container_state",return_value={"State":{"Running":True}}), \
             patch.object(vision,"config",return_value={"image":"pinned"}), \
             patch.object(vision,"fetch_photo",return_value=(b"webp","photo-url")) as fetch, \
             patch.object(vision,"convert_photo",return_value=b"png-pixels") as convert, \
             patch.object(vision,"infer_png",side_effect=[{"answer":"cream"},{"answer":"cream"}]) as infer:
            reports=vision.bench_image(offer_id="123",task="type",repeat=2)
            self.assertEqual(len(reports),2)
            fetch.assert_called_once_with("123")
            convert.assert_called_once()
            self.assertEqual([call.args[0] for call in infer.call_args_list],[b"png-pixels",b"png-pixels"])
            self.assertEqual([call.args[4] for call in infer.call_args_list],[1,2])

    def test_archive_sampler_is_read_only_bounded_and_deduplicates_ids(self):
        rows=[{"offer_id":"1","name":"Original","category":"Milch"},{"offer_id":"1"},{"offer_id":"2","name":"Tafeläpfel"}]
        with patch.object(vision,"run",return_value=SimpleNamespace(stdout=json.dumps(rows))) as run:
            result=vision.archive_samples(2)
            self.assertEqual([row["offer_id"] for row in result],["1","2"])
            args,kwargs=run.call_args
            self.assertEqual(args[0][:6],["docker","compose","exec","-T","db","sh"])
            self.assertIn("default_transaction_read_only=on",args[0][7])
            self.assertEqual(kwargs["cwd"],vision.ROOT)
        with patch.object(vision,"run",return_value=SimpleNamespace(stdout='[{"offer_id":"bad"}]')):
            with self.assertRaises(ValueError):
                vision.archive_samples(2)
        with self.assertRaises(ValueError):
            vision.archive_samples(6)

    def test_batch_preserves_failures_and_continues_to_other_images_without_labels(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(vision,"STATE",Path(directory)), \
             patch.object(vision,"config",return_value={"image":"pinned"}), \
             patch.object(vision,"container_id",return_value="container"), \
             patch.object(vision,"container_state",return_value={"State":{"Running":True}}), \
             patch.object(vision,"bench_image",side_effect=[ValueError("photo 404"),[{"pass_index":1,"answer":"apple","elapsed_seconds":1},{"pass_index":2,"answer":"apple","elapsed_seconds":0.8}]]), \
             patch("builtins.print"):
            summary=vision.batch_bench(["1","2"],limit=2,repeat=2)
            self.assertTrue(summary["cases"][0]["failed"])
            self.assertFalse(summary["cases"][1]["failed"])
            self.assertEqual(len(summary["cases"][1]["runs"]),2)
            self.assertEqual(summary["automatic_labels_written"],0)
            self.assertIsNone(summary["accuracy"])
            self.assertEqual(len(list(Path(directory).glob("batch-*.json"))),1)

    def test_pinning_and_manifest(self):
        image = "ghcr.io/ggml-org/llama.cpp@sha256:" + "a" * 64
        self.assertEqual(vision.pinned_image(image), image)
        for invalid in ["ghcr.io/ggml-org/llama.cpp:server", "http://evil", image+";echo bad"]:
            with self.assertRaises(ValueError):
                vision.pinned_image(invalid)
        self.assertEqual(sum(row["size"] for row in vision.MANIFEST["files"]),278824384)
        self.assertEqual(len(vision.MANIFEST["revision"]),40)
        for row in vision.MANIFEST["files"]:
            self.assertRegex(row["sha256"],r"^[a-f0-9]{64}$")

    def test_checksum_failure_preserves_previous_model_and_cleans_partial(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"test.gguf"
            path.write_bytes(b"old")
            data=b"new"
            record={"name":"test.gguf","size":3,"sha256":hashlib.sha256(data).hexdigest()}
            self.assertFalse(vision.file_matches(path,record))
            with patch.object(vision.urllib.request,"urlopen",return_value=io.BytesIO(b"bad")):
                with self.assertRaises(ValueError):
                    vision.download_model(Path(directory),record)
            self.assertEqual(path.read_bytes(),b"old")
            self.assertFalse(path.with_suffix(".gguf.part").exists())
            with patch.object(vision.urllib.request,"urlopen",return_value=io.BytesIO(data)):
                vision.download_model(Path(directory),record)
            self.assertTrue(vision.file_matches(path,record))
            with patch.object(vision.urllib.request,"urlopen") as network:
                vision.download_model(Path(directory),record)
                network.assert_not_called()

    def test_compose_cannot_select_the_running_app_stack(self):
        with patch.dict(os.environ,{"COMPOSE_FILE":"compose.yaml:compose.public.yaml", "COMPOSE_PROJECT_NAME":"angebote-checker", "VISION_IMAGE":"untrusted"}), patch.object(vision,"run") as run:
            vision.compose("stop","vision")
            args,kwargs=run.call_args
            self.assertEqual(args[0][-4:],["-p","angebote-vision","stop","vision"])
            self.assertIn(str(vision.ROOT/"deploy/compose.vision.yaml"),args[0])
            self.assertNotIn("COMPOSE_FILE",kwargs["env"])
            self.assertNotIn("VISION_IMAGE",kwargs["env"])

    def test_photo_conversion_is_bounded_and_has_attached_stdin(self):
        image="ghcr.io/test/vision@sha256:"+"b"*64
        with patch.object(vision,"run",return_value=SimpleNamespace(stdout=png_fixture())) as run:
            png=vision.convert_photo(b"original-webp",image)
            self.assertTrue(png.startswith(b"\x89PNG"))
            args,kwargs=run.call_args
            self.assertIn("--interactive",args[0])
            self.assertIn("none",args[0])
            self.assertIn("128m",args[0])
            self.assertEqual(kwargs["input"],b"original-webp")
        with self.assertRaises(ValueError):
            vision.convert_photo(b"",image)

    def test_request_contains_actual_pixels_and_no_product_answer_hint(self):
        png=png_fixture()
        request=vision.pixel_request(png)
        content=request["messages"][0]["content"]
        self.assertEqual(base64.b64decode(content[0]["image_url"]["url"].split(",",1)[1]),png)
        self.assertEqual(content[1]["text"],vision.PROMPT)
        self.assertEqual(request["max_tokens"],96)
        self.assertNotIn("Gesichtspflege",json.dumps(request))
        self.assertNotIn("Creme",json.dumps(request))

    def test_invalid_offer_id_never_makes_a_network_request(self):
        with patch.object(vision.urllib.request,"build_opener") as network:
            for value in ["../etc/passwd", "https://evil", "", "123?x=1"]:
                with self.assertRaises(ValueError):
                    vision.fetch_photo(value)
            network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
