import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
settings = json.loads((ROOT / 'qa-config.json').read_text())
python = ROOT / '.runtime/qa-venv/bin/python'
if pathlib.Path(sys.executable).resolve() != python.resolve():
    if not python.exists():
        subprocess.run(['uv', 'venv', '--python', '3.11.15', str(python.parent.parent)], check=True)
    subprocess.run(['uv', 'pip', 'sync', '--python', str(python), str(ROOT / 'qa-requirements.lock')], check=True)
    subprocess.run([str(python), __file__], check=True)
    sys.exit()
from huggingface_hub import snapshot_download

path = pathlib.Path(snapshot_download(settings['clap_model'], revision=settings['clap_revision'],
                                     allow_patterns=['*.json', '*.txt', 'pytorch_model.bin']))
manifest = {'model': settings['clap_model'], 'revision': settings['clap_revision'], 'path': str(path),
            'license': 'Apache-2.0', 'files': []}
for file in sorted(path.iterdir()):
    if file.is_file():
        manifest['files'].append({'path': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size})
expected = json.loads((ROOT / 'qa-model.lock.json').read_text())
if {pathlib.Path(f['path']).name: f['sha256'] for f in manifest['files']} != {f['file']: f['sha256'] for f in expected['files']}:
    raise ValueError('Downloaded model differs from pinned hashes')
manifest_path = ROOT / '.runtime/qa-model.json'
if manifest_path.exists() and json.loads(manifest_path.read_text()) != manifest:
    raise ValueError('Existing QA model manifest differs; preserve and investigate it')
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('CLAP ready locally: ' + str(manifest_path))
