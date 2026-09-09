import hashlib
import json
import pathlib
import subprocess
import sys
import shutil

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

expected = json.loads((ROOT / 'qa-model.lock.json').read_text())
required = sum(f['bytes'] for f in expected['files'])
if shutil.disk_usage(ROOT).free < required + 10 * 1024 ** 3:
    raise ValueError(f'QA setup requires {required} artifact bytes plus 10 GiB reserve')
print(f'Verifying/downloading {required} bytes for {expected["model"]}; cached files are reused', flush=True)
path = pathlib.Path(snapshot_download(settings['clap_model'], revision=settings['clap_revision'],
                                     allow_patterns=[f['file'] for f in expected['files']]))
manifest = {'model': settings['clap_model'], 'revision': settings['clap_revision'], 'path': str(path),
            'license': 'Apache-2.0', 'files': []}
for file in [path / f['file'] for f in expected['files']]:
    if file.is_file():
        manifest['files'].append({'path': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size})
expected = json.loads((ROOT / 'qa-model.lock.json').read_text())
if {pathlib.Path(f['path']).name: f['sha256'] for f in manifest['files']} != {f['file']: f['sha256'] for f in expected['files']}:
    raise ValueError('Downloaded model differs from pinned hashes')
manifest_path = ROOT / '.runtime/qa-model.json'
if manifest_path.exists() and json.loads(manifest_path.read_text()) != manifest:
    previous = json.loads(manifest_path.read_text())
    baseline = json.loads((ROOT / 'docs/tasks/m02/clap-m1-baseline.lock.json').read_text())
    if previous['model'] != baseline['model'] or previous['revision'] != baseline['revision'] or {pathlib.Path(f['path']).name: f['sha256'] for f in previous['files']} != {f['file']: f['sha256'] for f in baseline['files']}:
        raise ValueError('Existing QA model manifest differs; preserve and investigate it')
    manifest_path.replace(ROOT / '.runtime/qa-model-m1.json')
temporary = manifest_path.with_suffix('.tmp')
temporary.write_text(json.dumps(manifest, indent=2) + '\n')
temporary.replace(manifest_path)
from qa import Clap
clap = Clap()
import numpy as np
inputs = clap.processor(audio=np.zeros(48000, dtype=np.float32), sampling_rate=48000, return_tensors='pt', padding='repeatpad')
text = clap.processor(text=['Silence', 'A wooden knock'], return_tensors='pt', padding=True)
with clap.torch.inference_mode():
    audio_features = clap.model.get_audio_features(**inputs)
    text_features = clap.model.get_text_features(**text)
    scores = (audio_features / audio_features.norm(dim=-1, keepdim=True)) @ (text_features / text_features.norm(dim=-1, keepdim=True)).T
    if not clap.torch.isfinite(scores).all():
        raise ValueError('QA readiness inference produced nonfinite similarities')
print('Readiness probe similarities: ' + str(scores.tolist()), flush=True)
print('CLAP ready locally: ' + str(manifest_path))
