"""Demonstrate restart skipping a task marked done before independent review."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('reviewed_runner', 'scripts/run_codex_tasks.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='feedback-runner-') as directory:
    root = Path(directory)
    subprocess.run(['git', 'init', '-q', directory], check=True)
    tasks = root / 'docs/tasks'
    tasks.mkdir(parents=True)
    task = tasks / '01-example.md'
    task.write_text('# Example\n\nStatus: [ ]\n')
    subprocess.run(['git', '-C', directory, 'add', '.'], check=True)
    subprocess.run(['git', '-C', directory, '-c', 'user.name=Review', '-c', 'user.email=review@example.invalid', 'commit', '-qm', 'Initial'], check=True)
    runner = module.TaskRunner(root, tasks)
    runner.save_state({'task': 'docs/tasks/01-example.md', 'base_head': module.run_git(root, 'rev-parse', 'HEAD').stdout.strip(), 'recovery_commits': [], 'attempts': 0})
    # The implementation has updated its status; the runner dies before review.
    task.write_text('# Example\n\nStatus: [x]\n')
    runner.implement = lambda *a: (_ for _ in ()).throw(AssertionError('Unexpected implementation'))
    runner.review = lambda *a: (_ for _ in ()).throw(AssertionError('Unexpected review'))
    result = runner.run()
    assert result == 0
    assert runner.state_path.exists()
    assert module.dirty_paths(root)
    print(json.dumps({'exit': result, 'review_was_called': False, 'active_state_remains': True, 'unreviewed_task_still_dirty': True}))
