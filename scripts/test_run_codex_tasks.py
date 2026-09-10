#!/usr/bin/env python3
"""Tests and a no-network fake-Codex smoke check for run_codex_tasks.py."""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import run_codex_tasks as runner


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=root, check=True, text=True, capture_output=True
    ).stdout.strip()


def initialize_repo(root: Path) -> None:
    git(root, "init", "-q")
    git(root, "config", "user.email", "runner@example.test")
    git(root, "config", "user.name", "Task Runner Test")


def write_task(folder: Path, number: int, *, complete: bool = False, note: str = "Not started") -> Path:
    path = folder / f"{number:02d}-task-{number}.md"
    mark = "x" if complete else " "
    path.write_text(f"# {number:02d} - Task {number}\n\nStatus: [{mark}] {note}\n\n## Work\n\nDo it.\n")
    return path


def fake_codex_main(argv: list[str]) -> int:
    output_index = argv.index("-o") + 1
    output_path = Path(argv[output_index])
    schema_path = Path(argv[argv.index("--output-schema") + 1])
    is_review = schema_path.name == "review-schema.json"
    if is_review and os.environ.get("FAKE_CODEX_FAIL_FIRST_REVIEW"):
        marker = Path.cwd() / ".git" / "fake-review-failed"
        if not marker.exists():
            marker.write_text("failed\n")
            print("fake review process failure", file=sys.stderr, flush=True)
            return 2
    print(json.dumps({"type": "thread.started", "thread_id": "fake-thread"}), flush=True)
    print(json.dumps({"type": "turn.started"}), flush=True)
    if is_review:
        result = {"status": "approved", "summary": "Fake review passed", "findings": []}
    else:
        prompt = argv[-1]
        match = re.search(r"^TASK_FILE:\s*(.+)$", prompt, re.MULTILINE)
        if match:
            task_path = Path.cwd() / match.group(1).strip()
            text = task_path.read_text().replace("Status: [ ]", "Status: [x]", 1)
            task_path.write_text(text)
            overview = task_path.parent / "00-overview.md"
            if overview.exists():
                overview.write_text(overview.read_text().replace("[ ]", "[x]", 1))
        result = {
            "status": "completed",
            "summary": "Fake implementation completed",
            "details": "No real Codex session was used.",
            "owner_acceptance_required": False,
        }
    print(
        json.dumps(
            {
                "type": "item.completed",
                "item": {"type": "agent_message", "text": json.dumps(result)},
            }
        ),
        flush=True,
    )
    print(json.dumps({"type": "turn.completed", "usage": {"input_tokens": 1}}), flush=True)
    output_path.write_text(json.dumps(result))
    return 0


def make_fake_repo(root: Path) -> Path:
    initialize_repo(root)
    folder = root / "docs" / "Tasks" / "demo"
    folder.mkdir(parents=True)
    (folder / "00-overview.md").write_text("# Tasks\n\n- [ ] Task 1\n")
    write_task(folder, 1)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "Initial tasks")
    return folder


def fake_command() -> str:
    return shlex.join([sys.executable, "-B", str(Path(__file__).resolve()), "--fake-codex"])


def smoke() -> int:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        folder = make_fake_repo(root)
        environment = {**os.environ, "CODEX_BIN": fake_command()}
        result = subprocess.run(
            [sys.executable, str(Path(runner.__file__).resolve()), str(folder)],
            cwd=root,
            env=environment,
            text=True,
            capture_output=True,
        )
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        if result.returncode != 0:
            return result.returncode
        commits = git(root, "rev-list", "--count", "HEAD")
        status = git(root, "status", "--porcelain")
        if commits != "2" or status or "Status: [x]" not in (folder / "01-task-1.md").read_text():
            print("Fake smoke assertions failed", file=sys.stderr)
            return 1
        print("Fake-Codex smoke passed; no real Codex session was started.")
        return 0


def recovery_smoke() -> int:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        folder = make_fake_repo(root)
        environment = {
            **os.environ,
            "CODEX_BIN": fake_command(),
            "FAKE_CODEX_FAIL_FIRST_REVIEW": "1",
        }
        result = subprocess.run(
            [sys.executable, str(Path(runner.__file__).resolve()), str(folder)],
            cwd=root,
            env=environment,
            text=True,
            capture_output=True,
        )
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        if result.returncode != 0:
            return result.returncode
        subjects = git(root, "log", "--format=%s").splitlines()
        if subjects[:3] != ["Task 1", runner.RECOVERY_COMMIT_MESSAGE, "Initial tasks"]:
            print(f"Unexpected recovery history: {subjects}", file=sys.stderr)
            return 1
        if git(root, "status", "--porcelain") or not runner.parse_task(folder / "01-task-1.md").complete:
            print("Recovery smoke assertions failed", file=sys.stderr)
            return 1
        print("Automatic recovery smoke passed; no real Codex session was started.")
        return 0


def resume_smoke() -> int:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        folder = make_fake_repo(root)
        initial = git(root, "rev-parse", "HEAD")
        task = folder / "01-task-1.md"
        task.write_text(task.read_text().replace("Status: [ ] Not started", "Status: [ ] Incomplete — task runner stopped before approval"))
        (root / "partial.txt").write_text("recovered implementation\n")
        git(root, "add", "-A")
        git(root, "commit", "-qm", runner.RECOVERY_COMMIT_MESSAGE)
        recovery = git(root, "rev-parse", "HEAD")

        environment = {**os.environ, "CODEX_BIN": fake_command()}
        result = subprocess.run(
            [sys.executable, str(Path(runner.__file__).resolve()), str(folder)],
            cwd=root,
            env=environment,
            text=True,
            capture_output=True,
        )
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        if result.returncode != 0:
            return result.returncode
        review_logs = list((root / ".git" / "codex-task-runner").glob("*/01-task-1/attempt-2/review.jsonl"))
        state_path = root / ".git" / "codex-task-runner" / "active-task.json"
        if (
            git(root, "rev-parse", "HEAD~2") != initial
            or git(root, "rev-parse", "HEAD~1") != recovery
            or state_path.exists()
            or not review_logs
            or not runner.parse_task(task).complete
        ):
            print("Restart recovery smoke assertions failed", file=sys.stderr)
            return 1
        print("Restart-from-checkpoint smoke passed; no real Codex session was started.")
        return 0


class StreamingDeadlineTests(unittest.TestCase):
    def test_quiet_operation_failure_and_deadline(self) -> None:
        for outcome in ("success", "exit", "turn.failed", "deadline", "chatty_deadline"):
            with self.subTest(outcome=outcome), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                printer = runner.LivePrinter(0, 1, runner.parse_task(write_task(root, 1)), "implement")
                start = {"type": "item.started", "item": {"id": "op", "type": "command_execution"}}
                end = {"type": "item.completed", "item": {"id": "op", "type": "command_execution"}}
                script = f"import json, time, sys; print({json.dumps(start)!r}, flush=True); "
                if outcome == "success":
                    script += f"time.sleep(1.2); print({json.dumps(end)!r}, flush=True)"
                elif outcome == "exit":
                    script += "sys.exit(7)"
                elif outcome == "turn.failed":
                    script += "print(json.dumps({'type': 'turn.failed'}), flush=True); time.sleep(30)"
                elif outcome == "chatty_deadline":
                    script += "\nwhile True: print('{}', flush=True); time.sleep(0.05)"
                else:
                    script += "time.sleep(30)"
                with mock.patch.object(runner, "WARN_AFTER_SECONDS", 0.1), mock.patch.object(runner, "interrupt_process", wraps=runner.interrupt_process) as interrupt, mock.patch.object(printer, "log", wraps=printer.log) as log:
                    command = [sys.executable, "-c", script]
                    if outcome == "success":
                        runner.run_streaming_process(command, root, root, "quiet", printer, timeout_seconds=5)
                        interrupt.assert_not_called()
                        self.assertTrue(any(call.args[0] == "warning" and "op" in call.args[1] for call in log.call_args_list))
                    else:
                        expected = "status 7" if outcome == "exit" else "turn failed" if outcome == "turn.failed" else "deadline"
                        with self.assertRaisesRegex(runner.RunnerError, expected):
                            runner.run_streaming_process(command, root, root, "quiet", printer, timeout_seconds=1)
                        if outcome != "exit":
                            self.assertIsNotNone(interrupt.call_args.args[0].poll())


class DiscoveryTests(unittest.TestCase):
    def test_discovers_numeric_order_and_skips_completed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            write_task(folder, 10)
            write_task(folder, 2, complete=True)
            (folder / "00-overview.md").write_text("# Overview\n")
            tasks = runner.discover_tasks(folder)
            self.assertEqual([task.number for task in tasks], [2, 10])
            self.assertEqual([task.number for task in tasks if not task.complete], [10])

    def test_task_status_is_authoritative_when_overview_is_stale(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            task = write_task(folder, 5, complete=True)
            (folder / "00-overview.md").write_text("| 05 | [ ] Task 5 |\n")
            self.assertTrue(runner.parse_task(task).complete)


class ResultAndRenderingTests(unittest.TestCase):
    def test_reviewer_can_edit_and_run_local_checks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            folder = make_fake_repo(root)
            task_runner = runner.TaskRunner(root, folder)
            task_runner.review_schema = root / "review-schema.json"
            task_runner.review_schema.write_text(json.dumps(runner.REVIEW_SCHEMA))
            task = runner.parse_task(folder / "01-task-1.md")
            printer = runner.LivePrinter(0, 1, task, "review + critical fixes")
            approved = ({"status": "approved", "summary": "Ready", "findings": []}, None)

            with mock.patch.object(task_runner, "codex_run", return_value=approved) as codex_run:
                task_runner.review(task, git(root, "rev-parse", "HEAD"), [], root, printer)

            command = codex_run.call_args.args[0]
            self.assertIn("--dangerously-bypass-approvals-and-sandbox", command)
            self.assertNotIn("--sandbox", command)

    def test_extracts_only_complete_structured_status_messages(self) -> None:
        raw = '{"status":"completed","summary":"Done"}'
        structured = runner.display_event(
            {"type": "item.completed", "item": {"type": "agent_message", "text": raw}}
        )
        plain = runner.display_event(
            {"type": "item.completed", "item": {"type": "agent_message", "text": "Hello"}}
        )
        self.assertEqual(structured, ("status message", "Done"))
        self.assertEqual(plain, ("agent message", None))

    def test_rejects_unexpected_structured_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "result.json"
            path.write_text('{"status":"maybe"}')
            with self.assertRaises(runner.RunnerError):
                runner.read_structured_result(path, {"completed"})


class GitRecoveryTests(unittest.TestCase):
    def test_restart_reconciles_active_task_before_checkboxes(self) -> None:
        class AbruptStop(BaseException):
            pass

        for stop_after in ("implementation", "review", "approval", "commit", "completion"):
            for later_task in (False, True):
                with self.subTest(stop_after=stop_after, later_task=later_task), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory).resolve()
                    folder = make_fake_repo(root)
                    if later_task:
                        write_task(folder, 2)
                        git(root, "add", "-A")
                        git(root, "commit", "-qm", "Add next task")
                    initial = git(root, "rev-parse", "HEAD")
                    events = []

                    class CrashRunner(runner.TaskRunner):
                        crash = True

                        def implement(self, task, log_dir, printer):
                            events.append(("implement", task.number))
                            (root / f"implementation-{task.number}.txt").write_text("implementation\n")
                            task.path.write_text(task.path.read_text().replace("Status: [ ]", "Status: [x]", 1))
                            if self.crash and stop_after == "implementation":
                                raise AbruptStop()
                            return {"status": "completed", "owner_acceptance_required": False}, "fake-thread"

                        def review(self, task, base_head, recovery_commits, log_dir, printer):
                            events.append(("review", task.number))
                            if task.number == 1:
                                self_test.assertEqual(base_head, initial)
                            self_test.assertEqual((root / f"implementation-{task.number}.txt").read_text(), "implementation\n")
                            (root / f"reviewed-{task.number}.txt").write_text("reviewed\n")
                            if self.crash and stop_after == "review":
                                raise AbruptStop()
                            return {"status": "approved"}

                        def save_state(self, state):
                            super().save_state(state)
                            if self.crash and stop_after == "approval" and state.get("approved_commit"):
                                raise AbruptStop()

                        def commit_task(self, task, base_head):
                            sha = super().commit_task(task, base_head)
                            if self.crash and stop_after == "commit":
                                raise AbruptStop()
                            return sha

                    self_test = self
                    first = CrashRunner(root, folder)
                    if stop_after == "completion":
                        first.run()
                    else:
                        with self.assertRaises(AbruptStop):
                            first.run()
                        self.assertTrue(first.state_path.exists())
                    committed_head = git(root, "rev-parse", "HEAD")
                    events.clear()
                    restarted = CrashRunner(root, folder)
                    restarted.crash = False
                    restarted.log_root = first.log_root.with_name(first.log_root.name + "-restart")
                    self.assertEqual(restarted.run(), 0)
                    if stop_after in {"implementation", "review", "approval"}:
                        self.assertIn(("review", 1), events)
                        if later_task:
                            self.assertLess(events.index(("review", 1)), events.index(("implement", 2)))
                    else:
                        self.assertNotIn(("implement", 1), events)
                        self.assertNotIn(("review", 1), events)
                        self.assertEqual(git(root, "rev-parse", "HEAD~1" if later_task and stop_after == "commit" else "HEAD"), committed_head)
                    self.assertFalse(restarted.state_path.exists())
                    self.assertEqual(git(root, "status", "--porcelain"), "")
                    self.assertTrue(all(task.complete for task in runner.discover_tasks(folder)))
                    self.assertEqual((root / "reviewed-1.txt").read_text(), "reviewed\n")

    def test_restart_after_commit_preserves_owner_pause(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            folder = make_fake_repo(root)
            write_task(folder, 2)
            git(root, "add", "-A")
            git(root, "commit", "-qm", "Add next task")
            first = runner.TaskRunner(root, folder)

            def implement(task, *args):
                task.path.write_text(task.path.read_text().replace("Status: [ ]", "Status: [x]", 1))
                return {"status": "completed", "owner_acceptance_required": True}, "fake-thread"

            commit_task = first.commit_task

            def commit_then_stop(*args):
                commit_task(*args)
                raise SystemExit(99)

            with mock.patch.object(first, "implement", side_effect=implement), mock.patch.object(first, "review", return_value={"status": "approved"}), mock.patch.object(first, "commit_task", side_effect=commit_then_stop):
                with self.assertRaises(SystemExit):
                    first.run()
            head = git(root, "rev-parse", "HEAD")
            restarted = runner.TaskRunner(root, folder)
            restarted.log_root = first.log_root.with_name(first.log_root.name + "-restart")
            with mock.patch.object(restarted, "run_task", side_effect=AssertionError("Owner pause must precede any task work")):
                self.assertEqual(restarted.run(), 0)
            self.assertEqual(git(root, "rev-parse", "HEAD"), head)
            self.assertFalse(restarted.state_path.exists())
            self.assertFalse(runner.parse_task(folder / "02-task-2.md").complete)

    def test_dry_run_reports_but_does_not_commit_dirty_tree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repo(root)
            (root / "tracked.txt").write_text("before\n")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "Initial")
            (root / "tracked.txt").write_text("after\n")
            runner.checkpoint_dirty_tree(root, dry_run=True)
            self.assertNotEqual(git(root, "status", "--porcelain"), "")
            self.assertEqual(git(root, "rev-list", "--count", "HEAD"), "1")


class FailureTests(unittest.TestCase):
    def test_reviewer_can_fix_critical_findings_before_approval(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = make_fake_repo(root)
            task = runner.parse_task(folder / "01-task-1.md")
            reviews = 0

            class ReviewFixRunner(runner.TaskRunner):
                def implement(self, task, log_dir, printer):
                    task.path.write_text(task.path.read_text().replace("Status: [ ]", "Status: [x]", 1))
                    return {
                        "status": "completed",
                        "summary": "Implemented",
                        "details": "Fake",
                        "owner_acceptance_required": False,
                    }, "fake-thread"

                def review(self, task, base_head, recovery_commits, log_dir, printer):
                    nonlocal reviews
                    reviews += 1
                    (self.root / "critical-fix.txt").write_text("fixed by reviewer\n")
                    return {
                        "status": "approved",
                        "summary": "Critical demo blocker fixed",
                        "findings": ["Fixed the critical observable behavior"],
                    }

            task_runner = ReviewFixRunner(root, folder)
            task_runner.log_root.mkdir(parents=True)
            task_runner.run_task(task, 0, 1, git(root, "rev-parse", "HEAD"), [], 1)
            self.assertEqual(reviews, 1)
            self.assertEqual((root / "critical-fix.txt").read_text(), "fixed by reviewer\n")
            self.assertEqual(git(root, "log", "-1", "--format=%s"), "Task 1")


class EndToEndFakeCodexTests(unittest.TestCase):
    def test_reviewed_task_is_committed_and_runner_advances(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = make_fake_repo(root)
            environment = {**os.environ, "CODEX_BIN": fake_command()}
            result = subprocess.run(
                [sys.executable, str(Path(runner.__file__).resolve()), str(folder)],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("Fake review passed", result.stdout)
            self.assertEqual(git(root, "status", "--porcelain"), "")
            self.assertEqual(git(root, "log", "-1", "--format=%s"), "Task 1")


if __name__ == "__main__":
    if "--fake-codex" in sys.argv:
        raise SystemExit(fake_codex_main(sys.argv[1:]))
    if "--smoke" in sys.argv:
        raise SystemExit(smoke())
    if "--recovery-smoke" in sys.argv:
        raise SystemExit(recovery_smoke())
    if "--resume-smoke" in sys.argv:
        raise SystemExit(resume_smoke())
    unittest.main()
