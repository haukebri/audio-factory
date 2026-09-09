"""Download the pinned Medium set; resume partial files and never replace mismatches."""
import hashlib
import json
import pathlib
import subprocess
import time

root = pathlib.Path(__file__).resolve().parent
config = json.loads((root / "config.json").read_text())
deadline = time.monotonic() + 60 * 60
for model in config["models"]:
    target = root / ".runtime/sa3-gguf/models" / model["file"]
    target.parent.mkdir(parents=True, exist_ok=True)
    source = target if target.exists() else target.with_suffix(".gguf.partial")
    if source != target:
        print(f"Downloading/resuming {model['file']}; partial bytes preserved on failure", flush=True)
        subprocess.run([
            "curl", "--fail", "--location", "--retry", "3", "--continue-at", "-",
            "--max-time", str(max(1, int(deadline - time.monotonic()))),
            "--output", str(source), model["url"],
        ], check=True)
    with source.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != model["sha256"] or source.stat().st_size != model["bytes"]:
        raise RuntimeError(f"Model mismatch; preserved without replacement: {source}")
    if source != target:
        source.rename(target)
    print(f"Verified {model['file']} {digest}", flush=True)
