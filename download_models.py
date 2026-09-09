import hashlib
import json
import pathlib
from urllib.parse import urlparse

from huggingface_hub import hf_hub_download

root = pathlib.Path(__file__).resolve().parent
config = json.loads((root / "config.json").read_text())
for model in config["models"]:
    target = root / ".runtime/official-sa3/optimized/mlx/models/mlx" / model["file"]
    if not target.exists():
        parts = urlparse(model["url"]).path.strip("/").split("/")
        assert parts[2] == "resolve"
        source = pathlib.Path(hf_hub_download("/".join(parts[:2]), "/".join(parts[4:]), revision=parts[3]))
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_symlink():
            target.symlink_to(source)
        elif target.resolve() != source.resolve():
            raise RuntimeError(f"Unexpected model symlink target: {target}")
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != model["sha256"] or target.stat().st_size != model["bytes"]:
        raise RuntimeError(f"Model mismatch; preserved without replacement: {target}")
    print(f"Verified {model['file']}", flush=True)
