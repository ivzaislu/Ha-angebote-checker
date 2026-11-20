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
