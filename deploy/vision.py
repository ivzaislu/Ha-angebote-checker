#!/usr/bin/env python3
"""Optional, local pixel-inference experiment; never writes application data."""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / ".vision"
MANIFEST = json.loads((ROOT / "deploy/vision-models.json").read_text())
PROMPT = (
    "Describe the product visible in this photograph. What type of product is it? "
    "Read any clearly legible label. If you cannot identify it, say uncertain. "
    "Do not invent a brand, ingredients or quantity. Answer briefly in English."
)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def pinned_image(value):
    if not re.fullmatch(r"ghcr\.io/[a-zA-Z0-9_./-]+(?:[:][a-zA-Z0-9_.-]+)?@sha256:[a-f0-9]{64}", value):
        raise ValueError("Use a GHCR image pinned with @sha256:<64 hex characters>")
    return value


def file_matches(path, spec):
    if not path.is_file() or path.stat().st_size != spec["size"]:
        return False
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else None
        if digest is None:  # Ubuntu 22.04's Python 3.10.
            handle.seek(0)
            hasher = hashlib.sha256()
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(block)
            digest = hasher.hexdigest()
    return digest == spec["sha256"]


def download_model(directory, spec):
    destination = directory / spec["name"]
    if file_matches(destination, spec):
        print(f"Verified existing {spec['name']}", flush=True)
        return
    url = f"https://huggingface.co/{MANIFEST['repository']}/resolve/{MANIFEST['revision']}/{spec['name']}?download=true"
    temporary = destination.with_suffix(".gguf.part")
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "angebote-vision-test/1"})
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            count = 0
            while block := response.read(1024 * 1024):
                count += len(block)
                if count > spec["size"]:
                    raise ValueError("Model download exceeds pinned size")
                output.write(block)
        if not file_matches(temporary, spec):
            raise ValueError(f"Model checksum/size mismatch: {spec['name']}")
        temporary.chmod(0o644)
        temporary.replace(destination)
        print(f"Downloaded and verified {spec['name']}", flush=True)
    finally:
        temporary.unlink(missing_ok=True)


def config():
    return json.loads((STATE / "config.json").read_text())


def compose(*args, capture=False):
    env = dict(os.environ)
    # An application's exported COMPOSE_FILE/project must never select its stack.
    for key in ["COMPOSE_FILE", "COMPOSE_PROJECT_NAME", "VISION_IMAGE", "VISION_MODEL_DIR"]:
        env.pop(key, None)
    command = ["docker", "compose", "--env-file", str(STATE / "vision.env"),
               "-f", str(ROOT / "deploy/compose.vision.yaml"), "-p", "angebote-vision", *args]
    return run(command, env=env, capture_output=capture, text=True)


def prepare(image):
    image = pinned_image(image)
    if any(char in str(STATE) for char in ["$", "\n", "\r"]):
        raise ValueError("Checkout path cannot contain $, CR or LF")
    directory = STATE / "models"
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o755)  # Read-only model mount is consumed by UID 65534.
    for spec in MANIFEST["files"]:
        download_model(directory, spec)
    run(["docker", "pull", "--platform", "linux/amd64", image])
    data = {"image": image, "repository": MANIFEST["repository"], "revision": MANIFEST["revision"]}
    (STATE / "config.json").write_text(json.dumps(data, indent=2) + "\n")
    environment = STATE / "vision.env"
    environment.write_text(f"VISION_IMAGE={image}\nVISION_MODEL_DIR={json.dumps(str(directory))}\n")
    environment.chmod(0o600)
    compose("config", "--quiet")


def container_id():
    value = compose("ps", "-a", "-q", "vision", capture=True).stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{12,64}", value):
        raise ValueError("No unique experimental vision container; run start first")
    return value


def container_state(identifier):
    return json.loads(run(["docker", "inspect", identifier], capture_output=True, text=True).stdout)[0]


def memory(identifier):
    command = "for f in memory.current memory.peak memory.swap.current memory.events; do if [ -r /sys/fs/cgroup/$f ]; then echo $f; cat /sys/fs/cgroup/$f; fi; done"
    result = subprocess.run(["docker", "exec", identifier, "sh", "-c", command], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def fetch_photo(offer_id):
    if not re.fullmatch(r"[0-9]{1,20}", offer_id):
        raise ValueError("Marktguru offer ID must contain 1..20 digits")
    url = f"https://cdn.marktguru.de/api/v1/offers/{offer_id}/images/default/0/medium.webp"
    class SameCDN(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            from urllib.parse import urlparse
            parsed = urlparse(newurl)
            if parsed.scheme != "https" or parsed.hostname != "cdn.marktguru.de":
                raise ValueError("Image redirect left Marktguru CDN")
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.build_opener(SameCDN()).open(request, timeout=30) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("Image exceeds 8 MiB")
    return data, url


def convert_photo(data, image):
    if not data or len(data) > 8 * 1024 * 1024:
        raise ValueError("Expected a non-empty image of at most 8 MiB")
    # WebP is converted explicitly: the model receives PNG pixels, never a URL
    # that might be ignored. This short-lived helper has no network or model mount.
    command = ["docker", "run", "--rm", "--interactive", "--network", "none", "--read-only", "--user", "65534:65534",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--memory", "128m",
               "--memory-swap", "128m", "--cpus", "1", "--entrypoint", "ffmpeg", image,
               "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vf",
               "scale=384:384:force_original_aspect_ratio=decrease", "-frames:v", "1",
               "-f", "image2pipe", "-vcodec", "png", "pipe:1"]
    converted = run(command, input=data, capture_output=True, timeout=45).stdout
    if not converted.startswith(b"\x89PNG\r\n\x1a\n") or len(converted) > 8 * 1024 * 1024:
        raise ValueError("Image conversion did not produce a bounded PNG")
    return converted


def pixel_request(png):
    return {"model": "products-vision", "temperature": 0, "max_tokens": 96, "stream": False,
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}},
                {"type": "text", "text": PROMPT}]}]}


def bench(offer_id=None, image_path=None):
    STATE.mkdir(exist_ok=True)
    with (STATE / "bench.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("One vision benchmark is already running")
        identifier = container_id()
        before = container_state(identifier)
        if not before["State"]["Running"]:
            raise ValueError("Vision container is not running")
        if offer_id:
            data, source = fetch_photo(offer_id)
        else:
            path = Path(image_path)
            if path.stat().st_size > 8 * 1024 * 1024:
                raise ValueError("Image exceeds 8 MiB")
            data, source = path.read_bytes(), str(path)
        png = convert_photo(data, config()["image"])
        report = {"source": source, "model": config(), "image_sha256": hashlib.sha256(png).hexdigest(),
                  "prompt": PROMPT, "memory_before": memory(identifier), "automatic_labels_written": 0}
        start = time.monotonic()
        try:
            request = urllib.request.Request("http://127.0.0.1:8081/v1/chat/completions",
                data=json.dumps(pixel_request(png)).encode(), headers={"Content-Type": "application/json"})
            # Do not send localhost traffic through an inherited HTTP proxy.
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=180) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError("Vision response too large")
            result = json.loads(raw)
            answer = result["choices"][0]["message"]["content"]
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("Vision returned no description")
            report.update(answer=answer, usage=result.get("usage"), finish_reason=result["choices"][0].get("finish_reason"))
        except Exception as error:
            report["error"] = str(error)
        finally:
            report.update(elapsed_seconds=round(time.monotonic() - start, 2), memory_after=memory(identifier))
            state = container_state(identifier)
            report["container"] = {"image_id": state["Image"], "state": state["State"],
                "ram_limit_bytes": state["HostConfig"]["Memory"], "ram_plus_swap_limit_bytes": state["HostConfig"]["MemorySwap"]}
            path = STATE / f"result-{time.time_ns()}.json"
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps(report, ensure_ascii=False, indent=2))
            print(f"Report: {path}")
        if report.get("error"):
            raise ValueError("Vision experiment failed; see report and vision container logs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare_parser = sub.add_parser("prepare")
    prepare_parser.add_argument("--image", required=True)
    for name in ["start", "status", "stop", "logs"]:
        sub.add_parser(name)
    benchmark = sub.add_parser("bench")
    source = benchmark.add_mutually_exclusive_group(required=True)
    source.add_argument("--offer-id")
    source.add_argument("--image-file")
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.image)
    elif args.command == "start":
        config()
        compose("up", "-d", "--wait", "--wait-timeout", "180", "vision")
    elif args.command == "stop":
        compose("stop", "vision")
    elif args.command == "logs":
        compose("logs", "--tail", "60", "vision")
    elif args.command == "status":
        compose("ps", "-a")
        state = container_state(container_id())
        print(json.dumps({"state": state["State"], "memory": memory(state["Id"])}, indent=2))
    elif args.command == "bench":
        bench(args.offer_id, args.image_file)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Vision experiment: {error}", file=sys.stderr)
        sys.exit(1)
