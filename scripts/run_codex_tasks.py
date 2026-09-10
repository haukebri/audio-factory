#!/usr/bin/env python3
"""Run numbered Markdown tasks through Codex, one reviewed commit at a time."""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import shlex
import shutil
import signal
import subprocess
import sys
import textwrap
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


WARN_AFTER_SECONDS = 5 * 60
STALL_AFTER_SECONDS = 30 * 60
MAX_TASK_ATTEMPTS = 6
HEARTBEAT_SECONDS = 30
RECOVERY_COMMIT_MESSAGE = "Task runner recovery checkpoint"

TASK_NAME = re.compile(r"^(\d+)-.+\.md$")
STATUS_LINE = re.compile(r"^Status:\s*\[([ xX])\](.*)$", re.MULTILINE)

IMPLEMENTATION_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["completed", "blocked", "failed"]},
        "summary": {"type": "string"},
        "details": {"type": "string"},
        "owner_acceptance_required": {"type": "boolean"},
    },
    "required": ["status", "summary", "details", "owner_acceptance_required"],
    "additionalProperties": False,
}

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {
            "type": "string",
            "enum": ["approved", "blocked", "failed"],
        },
        "summary": {"type": "string"},
        "findings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["status", "summary", "findings"],
    "additionalProperties": False,
}


class RunnerError(RuntimeError):
    pass


class RunnerInterrupted(RunnerError):
    pass


class TaskBlocked(RunnerError):
    pass


@dataclass(frozen=True)
class Task:
    number: int
    path: Path
    title: str
    complete: bool
    status_note: str

    @property
    def blocked(self) -> bool:
        return not self.complete and "blocked" in self.status_note.lower()


def run_git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        capture_output=True,
        check=check,
    )


def git_root(start: Path) -> Path:
    result = run_git(start, "rev-parse", "--show-toplevel")
    return Path(result.stdout.strip()).resolve()


def parse_task(path: Path) -> Task:
    match = TASK_NAME.match(path.name)
    if not match:
        raise RunnerError(f"Invalid task filename: {path.name}")

    text = path.read_text()
    status = STATUS_LINE.search(text)
    if not status:
        raise RunnerError(f"Missing or invalid Status line: {path}")

    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    if not title_match:
        raise RunnerError(f"Missing task heading: {path}")

    title = re.sub(r"^\d+\s*[-–—:]\s*", "", title_match.group(1).strip())
    return Task(
        number=int(match.group(1)),
        path=path.resolve(),
        title=title,
        complete=status.group(1).lower() == "x",
        status_note=status.group(2).strip(),
    )


def discover_tasks(folder: Path) -> list[Task]:
    if not folder.is_dir():
        raise RunnerError(f"Task folder does not exist: {folder}")

    tasks = [
        parse_task(path)
        for path in folder.iterdir()
        if path.is_file() and TASK_NAME.match(path.name) and not path.name.startswith("00-")
    ]
    tasks.sort(key=lambda task: (task.number, task.path.name))
    if not tasks:
        raise RunnerError(f"No numbered task files found in {folder}")
    if len({task.number for task in tasks}) != len(tasks):
        raise RunnerError(f"Duplicate task numbers in {folder}")
    return tasks


def dirty_paths(root: Path) -> list[str]:
    output = run_git(root, "status", "--porcelain=v1", "-z").stdout
    paths: list[str] = []
    entries = output.split("\0")
    index = 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if not entry:
            continue
        paths.append(entry[3:])
        if entry[:2] in {"R ", " R", "C ", " C"} and index < len(entries):
            if entries[index]:
                paths.append(entries[index])
            index += 1
    return paths


def checkpoint_dirty_tree(root: Path, *, dry_run: bool = False) -> str | None:
    paths = dirty_paths(root)
    if not paths:
        return None

    action = "Would checkpoint" if dry_run else "Checkpointing"
    print(f"{action} dirty worktree:")
    for path in paths:
        print(f"  {path}")
    if dry_run:
        return None

    run_git(root, "add", "-A")
    commit = run_git(root, "commit", "-m", RECOVERY_COMMIT_MESSAGE, check=False)
    if commit.returncode != 0:
        message = (commit.stderr or commit.stdout).strip()
        raise RunnerError(f"Recovery commit failed: {message}")
    sha = run_git(root, "rev-parse", "--short", "HEAD").stdout.strip()
    print(f"Recovery checkpoint committed: {sha}")
    return sha


def reset_task_status(task: Task) -> None:
    text = task.path.read_text()
    status = STATUS_LINE.search(text)
    if not status or status.group(1).lower() != "x":
        return
    changed, count = STATUS_LINE.subn(
        "Status: [ ] Incomplete — task runner stopped before approval",
        text,
        count=1,
    )
    if count and changed != text:
        task.path.write_text(changed)


def progress_bar(done: int, total: int, width: int = 20) -> str:
    filled = width if total == 0 else int(width * done / total)
    return "[" + "█" * filled + "░" * (width - filled) + f"] {done}/{total}"


def duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def short_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {seconds}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m"


class LivePrinter:
    def __init__(self, done: int, total: int, task: Task, phase: str):
        self.done = done
        self.total = total
        self.task = task
        self.phase = phase
        self.started = time.monotonic()
        self.last_activity = self.started
        self.last_activity_label = "starting"
        self.status_messages_started = False
        self.notice: str | None = None
        self.rendered_lines = 0
        self.last_tty_status = 0.0
        self.last_non_tty_status = 0.0
        self.tty = sys.stdout.isatty()

    def set_phase(self, phase: str) -> None:
        self.phase = phase
        self.status(force=True)

    def activity(self, label: str = "Codex output") -> None:
        self.last_activity = time.monotonic()
        self.last_activity_label = label
        self.notice = None

    def status_message(self, message: str) -> None:
        message = message.strip()
        if not message:
            return
        self.activity("status message")
        if self.tty:
            self._clear_dashboard()
        if not self.status_messages_started:
            print("Status messages:", flush=True)
            self.status_messages_started = True
        width = max(20, shutil.get_terminal_size((120, 24)).columns - 3)
        lines = self._wrapped(message, width)
        print(f"- {lines[0]}", flush=True)
        for line in lines[1:]:
            print(f"  {line}", flush=True)
        print(flush=True)
        self.status(force=self.tty)

    def _wrapped(self, text: str, width: int) -> list[str]:
        lines: list[str] = []
        for line in text.splitlines() or [""]:
            lines.extend(textwrap.wrap(line, width=width, break_on_hyphens=False) or [""])
        return lines

    def _dashboard(self, now: float) -> list[str]:
        width = max(20, shutil.get_terminal_size((120, 24)).columns - 1)
        lines = ["__________", ""]
        if self.notice:
            lines.extend(self._wrapped(f"Notice: {self.notice}", width))
        lines.extend(
            self._wrapped(
                f"Last activity: {self.last_activity_label} "
                f"{short_duration(now - self.last_activity)} ago",
                width,
            )
        )
        lines.extend(
            self._wrapped(
                f"{progress_bar(self.done, self.total)} | Task {self.task.number:02d}: "
                f"{self.task.title} | {self.phase} | elapsed {duration(now - self.started)} "
                f"| silent {duration(now - self.last_activity)}",
                width,
            )
        )
        return lines

    def _clear_dashboard(self) -> None:
        if self.rendered_lines:
            sys.stdout.write("\r")
            if self.rendered_lines > 1:
                sys.stdout.write(f"\033[{self.rendered_lines - 1}A")
            sys.stdout.write("\033[J")
            sys.stdout.flush()
            self.rendered_lines = 0

    def _redraw(self, lines: list[str]) -> None:
        self._clear_dashboard()
        sys.stdout.write("\n".join(lines))
        sys.stdout.flush()
        self.rendered_lines = len(lines)

    def status(self, *, force: bool = False) -> None:
        now = time.monotonic()
        if self.tty:
            if not force and now - self.last_tty_status < 1:
                return
            self._redraw(self._dashboard(now))
            self.last_tty_status = now
        elif force or now - self.last_non_tty_status >= HEARTBEAT_SECONDS:
            line = (
                f"{progress_bar(self.done, self.total)} | Task {self.task.number:02d}: "
                f"{self.task.title} | {self.phase} | elapsed {duration(now - self.started)} "
                f"| last activity {self.last_activity_label} "
                f"{short_duration(now - self.last_activity)} ago"
            )
            print(line, flush=True)
            self.last_non_tty_status = now

    def log(self, label: str, message: str) -> None:
        if label in {"warning", "error", "interrupt"}:
            self.notice = f"{label}: {message.strip()}"
        else:
            self.activity(
                {
                    "runner": "runner update",
                    "result": "implementation result",
                    "review": "review result",
                    "commit": "commit",
                    "stderr": "stderr output",
                    "stdout": "unparsed Codex output",
                }.get(label, label.replace("_", " "))
            )
        if not self.tty and label in {
            "runner",
            "result",
            "review",
            "commit",
            "warning",
            "error",
            "interrupt",
        }:
            for line in message.rstrip("\n").splitlines() or [""]:
                print(f"[{self.task.number:02d}/{self.phase}/{label}] {line}", flush=True)
        self.status(force=self.tty)

    def finish(self) -> None:
        if self.tty:
            self.status(force=True)
            print(flush=True)
            self.rendered_lines = 0


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def display_event(event: dict[str, Any]) -> tuple[str, str | None]:
    event_type = str(event.get("type", "event"))
    item = event.get("item") if isinstance(event.get("item"), dict) else None
    if item is not None:
        item_type = str(item.get("type", "item"))
        state = event_type.rsplit(".", 1)[-1]
        if item_type == "agent_message":
            text = item.get("text") or item.get("message") or item.get("content")
            if text and state != "started":
                try:
                    parsed = json.loads(str(text))
                except json.JSONDecodeError:
                    pass
                else:
                    if isinstance(parsed, dict) and "status" in parsed:
                        summary = parsed.get("summary")
                        if isinstance(summary, str) and summary.strip():
                            return "status message", summary.strip()
            return "agent message", None
        if item_type == "command_execution":
            return f"command {state}", None
        labels = {
            "file_change": "file change",
            "mcp_tool_call": "tool call",
            "tool_call": "tool call",
            "web_search": "web search",
            "plan": "plan update",
            "reasoning": "reasoning",
        }
        return labels.get(item_type, item_type.replace("_", " ")), None

    if event_type == "thread.started":
        return "Codex thread started", None
    return event_type.replace(".", " "), None


def interrupt_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGINT)
        process.wait(timeout=10)
        return
    except (ProcessLookupError, subprocess.TimeoutExpired):
        pass
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
        return
    except (ProcessLookupError, subprocess.TimeoutExpired):
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _read_stream(name: str, stream: Any, events: queue.Queue[tuple[str, str | None]]) -> None:
    try:
        for line in iter(stream.readline, ""):
            events.put((name, line))
    finally:
        events.put((name, None))


def run_streaming_process(
    command: list[str],
    cwd: Path,
    log_dir: Path,
    log_name: str,
    printer: LivePrinter,
) -> str | None:
    stdout_path = log_dir / f"{log_name}.jsonl"
    stderr_path = log_dir / f"{log_name}.stderr.log"
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            start_new_session=True,
        )
    except OSError as error:
        raise RunnerError(f"Could not start Codex: {error}") from error
    assert process.stdout is not None and process.stderr is not None

    messages: queue.Queue[tuple[str, str | None]] = queue.Queue()
    threads = [
        threading.Thread(target=_read_stream, args=("stdout", process.stdout, messages), daemon=True),
        threading.Thread(target=_read_stream, args=("stderr", process.stderr, messages), daemon=True),
    ]
    for thread in threads:
        thread.start()

    open_streams = 2
    warned = False
    thread_id: str | None = None
    with stdout_path.open("w") as stdout_log, stderr_path.open("w") as stderr_log:
        try:
            while open_streams or process.poll() is None:
                try:
                    stream_name, line = messages.get(timeout=0.5)
                except queue.Empty:
                    line = None
                    stream_name = ""
                if stream_name and line is None:
                    open_streams -= 1
                elif line is not None:
                    warned = False
                    if stream_name == "stdout":
                        stdout_log.write(line)
                        stdout_log.flush()
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            printer.activity("unparsed Codex output")
                        else:
                            if event.get("type") == "thread.started" and event.get("thread_id"):
                                thread_id = str(event["thread_id"])
                            activity, status_message = display_event(event)
                            printer.activity(activity)
                            if status_message:
                                printer.status_message(status_message)
                    else:
                        stderr_log.write(line)
                        stderr_log.flush()
                        printer.activity("stderr output")

                silence = time.monotonic() - printer.last_activity
                if silence >= WARN_AFTER_SECONDS and not warned:
                    printer.log("warning", f"No Codex output for {duration(silence)}")
                    warned = True
                if silence >= STALL_AFTER_SECONDS:
                    printer.log("error", f"Stopping Codex after {duration(silence)} without output")
                    interrupt_process(process)
                    raise RunnerError(f"Codex stalled for {duration(silence)}")
                printer.status()
        except KeyboardInterrupt as error:
            printer.log("interrupt", "Stopping the active Codex process")
            interrupt_process(process)
            raise RunnerInterrupted("Interrupted by user") from error

    return_code = process.wait()
    if return_code != 0:
        raise RunnerError(f"Codex exited with status {return_code}; logs: {log_dir}")
    return thread_id


def read_structured_result(path: Path, allowed: set[str]) -> dict[str, Any]:
    try:
        result = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(f"Invalid structured result in {path}: {error}") from error
    if not isinstance(result, dict) or result.get("status") not in allowed:
        raise RunnerError(f"Unexpected structured result in {path}: {compact_json(result)}")
    return result


def write_schemas(log_root: Path) -> tuple[Path, Path]:
    implementation = log_root / "implementation-schema.json"
    review = log_root / "review-schema.json"
    implementation.write_text(json.dumps(IMPLEMENTATION_SCHEMA, indent=2) + "\n")
    review.write_text(json.dumps(REVIEW_SCHEMA, indent=2) + "\n")
    return implementation, review


def implementation_prompt(task: Task, root: Path) -> str:
    relative = task.path.relative_to(root)
    return f"""Implement exactly one repository task.

TASK_FILE: {relative}

Read the task file completely, then read its overview, referenced specification, repository AGENTS.md instructions, and the code paths needed to understand the full flow. Implement only this task with the smallest correct change. Do not touch unrelated code and do not commit.

Perform every automated, browser, smoke, and cleanup check required by the task. Do not claim a check ran if it did not. Update the task Status to [x] and its overview row only after the implementation and all checks available to you are complete. If the task explicitly requires owner acceptance before the next task, finish all machine-verifiable work, set owner_acceptance_required to true, and mark the task complete so the runner can commit and pause for the owner.

Return status=completed only when the task is ready for independent review. Return blocked when a decision or unavailable external input is required. Return failed when the task could not be completed. Put concise evidence and any unrun checks in details."""


def review_prompt(task: Task, base_head: str, recovery_commits: list[str]) -> str:
    recovered = ", ".join(recovery_commits) if recovery_commits else "none"
    return f"""Review and fix the implementation of Task {task.number:02d}: {task.title}.

The task started at commit {base_head}. Its task-owned recovery commits are: {recovered}. Read the task file, overview, referenced specification, AGENTS.md, each listed recovery commit, and all staged, unstaged, and untracked changes. Review the current implementation against the complete task, including code already captured in recovery commits.

This is the milestone's final review-and-fix pass, not a production-readiness audit. Look only for critical findings or issues that would prevent the required demo from working honestly. Critical means a security or privacy boundary violation, data loss, a build or startup failure in the changed path, a broken primary task flow, a required demo state that cannot be shown, or status/evidence that presents failure as success. Omit style, cleanup, speculative edge cases, extra hardening, broader test coverage, and other noncritical work that is unnecessary for the demo.

When you find an in-scope blocker, fix its root cause immediately with the smallest change and add only the smallest useful behavioral regression. Run the affected checks after your edits. Do not commit. Return approved when no known critical or demo-blocking issue remains, including after fixes you made. Put only fixed critical findings in findings. Return blocked when required owner input or unavailable external input prevents a safe fix, and failed when the critical review or fix cannot be completed."""


class TaskRunner:
    def __init__(self, root: Path, folder: Path, *, dry_run: bool = False):
        self.root = root
        self.folder = folder
        self.dry_run = dry_run
        self.codex = shlex.split(os.environ.get("CODEX_BIN", "codex"))
        if not self.codex:
            raise RunnerError("CODEX_BIN is empty")
        git_dir = run_git(root, "rev-parse", "--git-dir").stdout.strip()
        self.git_dir = (root / git_dir).resolve() if not Path(git_dir).is_absolute() else Path(git_dir)
        self.state_path = self.git_dir / "codex-task-runner" / "active-task.json"
        run_id = datetime.now().strftime("%Y%m%d-%H%M%S") + f"-{os.getpid()}"
        self.log_root = self.git_dir / "codex-task-runner" / run_id
        self.implementation_schema: Path | None = None
        self.review_schema: Path | None = None
        self.active_task: Task | None = None

    def prepare(self) -> list[Task]:
        tasks = discover_tasks(self.folder)
        if self.dry_run:
            checkpoint_dirty_tree(self.root, dry_run=True)
            return tasks
        self.log_root.mkdir(parents=True)
        self.implementation_schema, self.review_schema = write_schemas(self.log_root)
        return tasks

    def codex_run(
        self,
        command: list[str],
        result_path: Path,
        allowed: set[str],
        log_dir: Path,
        log_name: str,
        printer: LivePrinter,
    ) -> tuple[dict[str, Any], str | None]:
        thread_id = run_streaming_process(command, self.root, log_dir, log_name, printer)
        return read_structured_result(result_path, allowed), thread_id

    def implement(self, task: Task, log_dir: Path, printer: LivePrinter) -> tuple[dict[str, Any], str]:
        assert self.implementation_schema is not None
        result_path = log_dir / "implementation-result.json"
        command = [
            *self.codex,
            "exec",
            "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C",
            str(self.root),
            "--output-schema",
            str(self.implementation_schema),
            "-o",
            str(result_path),
            implementation_prompt(task, self.root),
        ]
        result, thread_id = self.codex_run(
            command,
            result_path,
            {"completed", "blocked", "failed"},
            log_dir,
            "implementation",
            printer,
        )
        if not thread_id:
            raise RunnerError("Implementation run did not report a thread id")
        return result, thread_id

    def review(
        self,
        task: Task,
        base_head: str,
        recovery_commits: list[str],
        log_dir: Path,
        printer: LivePrinter,
    ) -> dict[str, Any]:
        assert self.review_schema is not None
        result_path = log_dir / "review-result.json"
        command = [
            *self.codex,
            "exec",
            "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C",
            str(self.root),
            "--output-schema",
            str(self.review_schema),
            "-o",
            str(result_path),
            review_prompt(task, base_head, recovery_commits),
        ]
        result, _ = self.codex_run(
            command,
            result_path,
            {"approved", "blocked", "failed"},
            log_dir,
            "review",
            printer,
        )
        return result

    def ensure_agent_did_not_commit(self, base_head: str) -> None:
        current = run_git(self.root, "rev-parse", "HEAD").stdout.strip()
        if current != base_head:
            raise RunnerError("Codex created a commit; the runner requires review before committing")

    def commit_task(self, task: Task, base_head: str) -> str:
        self.ensure_agent_did_not_commit(base_head)
        refreshed = parse_task(task.path)
        if not refreshed.complete:
            raise RunnerError(f"Task {task.number:02d} did not mark its Status complete")
        if not dirty_paths(self.root):
            raise RunnerError(f"Task {task.number:02d} produced no uncommitted changes")

        diff_check = run_git(self.root, "diff", "--check", check=False)
        if diff_check.returncode != 0:
            raise RunnerError(f"git diff --check failed:\n{diff_check.stdout}{diff_check.stderr}")
        run_git(self.root, "add", "-A")
        cached_check = run_git(self.root, "diff", "--cached", "--check", check=False)
        if cached_check.returncode != 0:
            raise RunnerError(f"git diff --cached --check failed:\n{cached_check.stdout}{cached_check.stderr}")
        if run_git(self.root, "diff", "--cached", "--quiet", check=False).returncode == 0:
            raise RunnerError(f"Task {task.number:02d} produced no staged changes")

        state = self.load_state(task)
        if state is not None:
            # Record the approved tree before Git commits, closing the post-commit crash window.
            state["approved_commit"] = {
                "parent": base_head,
                "tree": run_git(self.root, "write-tree").stdout.strip(),
            }
            self.save_state(state)
        commit = run_git(self.root, "commit", "-m", task.title, check=False)
        if commit.returncode != 0:
            raise RunnerError(f"Task commit failed: {(commit.stderr or commit.stdout).strip()}")
        if dirty_paths(self.root):
            raise RunnerError("Worktree is dirty after the task commit")
        return run_git(self.root, "rev-parse", "--short", "HEAD").stdout.strip()

    def run_task(
        self,
        task: Task,
        done: int,
        total: int,
        task_base_head: str,
        recovery_commits: list[str],
        attempt_number: int,
    ) -> bool:
        self.active_task = task
        log_dir = self.log_root / task.path.stem / f"attempt-{attempt_number}"
        log_dir.mkdir(parents=True)
        printer = LivePrinter(done, total, task, "implement")
        printer.log("runner", f"Logs: {log_dir}")
        attempt_head = run_git(self.root, "rev-parse", "HEAD").stdout.strip()
        owner_gate = False
        try:
            result, _thread_id = self.implement(task, log_dir, printer)
            self.ensure_agent_did_not_commit(attempt_head)
            printer.log("result", f"{result['status']}: {result.get('summary', '')}")
            if result["status"] != "completed":
                if result["status"] == "blocked":
                    raise TaskBlocked(f"Task {task.number:02d} blocked: {result.get('details', '')}")
                raise RunnerError(f"Task {task.number:02d} {result['status']}: {result.get('details', '')}")
            owner_gate = bool(result.get("owner_acceptance_required"))
            printer.set_phase("review + critical fixes")
            review = self.review(task, task_base_head, recovery_commits, log_dir, printer)
            self.ensure_agent_did_not_commit(attempt_head)
            printer.log("review", f"{review['status']}: {review.get('summary', '')}")
            if review["status"] != "approved":
                if review["status"] == "blocked":
                    raise TaskBlocked(f"Review blocked: {review.get('summary', '')}")
                raise RunnerError(f"Review {review['status']}: {review.get('summary', '')}")

            printer.set_phase("commit")
            state = self.load_state(task)
            if state is not None:
                state["owner_acceptance_required"] = owner_gate
                self.save_state(state)
            sha = self.commit_task(task, attempt_head)
            printer.log("commit", f"Committed {sha}: {task.title}")
            printer.finish()
            self.active_task = None
            return owner_gate
        except BaseException:
            printer.finish()
            raise

    def dry_run_report(self, tasks: list[Task]) -> int:
        print(f"Task folder: {self.folder}")
        for task in tasks:
            state = "complete" if task.complete else "blocked" if task.blocked else "pending"
            print(f"  {task.number:02d}  {state:8}  {task.title}")
        pending = [task for task in tasks if not task.complete]
        if not pending:
            print("All tasks are complete; no Codex sessions would start.")
            return 0
        first = pending[0]
        if first.blocked:
            print(f"Would stop before blocked task {first.number:02d}: {first.status_note}")
            return 0
        print(f"Next task: {first.number:02d} — {first.title}")
        print("Would run: implementation → critical review and fixes → commit")
        print("Dry run complete; no Git changes or Codex sessions were started.")
        return 0

    def run(self) -> int:
        tasks = self.prepare()
        if self.dry_run:
            return self.dry_run_report(tasks)

        active_state = self.load_state()
        if active_state is not None:
            active = next((task for task in tasks if str(task.path.relative_to(self.root)) == active_state["task"]), None)
            if active is None:
                raise RunnerError("Active task-runner state belongs to another task folder")
            approved = active_state.get("approved_commit")
            if (
                isinstance(approved, dict)
                and active.complete
                and run_git(self.root, "show", "-s", "--format=%P", "HEAD").stdout.strip() == approved.get("parent")
                and run_git(self.root, "rev-parse", "HEAD^{tree}").stdout.strip() == approved.get("tree")
            ):
                self.clear_state()
                if active_state.get("owner_acceptance_required"):
                    print(f"Paused after Task {active.number:02d} for required owner acceptance. Rerun to continue.")
                    return 0
                active_state = None
            else:
                # Finish the durable transaction before considering any task checkbox.
                tasks = [active, *(task for task in tasks if task != active)]
                self.active_task = active
                recovery_commit = self.recover()
                if recovery_commit:
                    active_state["recovery_commits"].append(recovery_commit)
                self.save_state(active_state)

        completed = sum(parse_task(task.path).complete for task in tasks)
        total = len(tasks)
        print(f"Run logs: {self.log_root}")
        for original in tasks:
            task = parse_task(original.path)
            if task.complete:
                continue
            if task.blocked:
                raise RunnerError(f"Task {task.number:02d} is marked blocked: {task.status_note}")
            state = self.load_state(task)
            checkpoint_dirty_tree(self.root)
            if state is None:
                state = {
                    "task": str(task.path.relative_to(self.root)),
                    "base_head": run_git(self.root, "rev-parse", "HEAD").stdout.strip(),
                    "recovery_commits": [],
                    "attempts": 0,
                }
                self.save_state(state)

            while True:
                try:
                    owner_gate = self.run_task(
                        task,
                        completed,
                        total,
                        str(state["base_head"]),
                        [str(commit) for commit in state["recovery_commits"]],
                        int(state["attempts"]) + 1,
                    )
                    break
                except (KeyboardInterrupt, RunnerInterrupted):
                    self.recover()
                    raise
                except TaskBlocked:
                    recovery_commit = self.recover()
                    if recovery_commit:
                        state["recovery_commits"].append(recovery_commit)
                    state["attempts"] = int(state["attempts"]) + 1
                    self.save_state(state)
                    raise
                except RunnerError as error:
                    recovery_commit = self.recover()
                    if recovery_commit:
                        state["recovery_commits"].append(recovery_commit)
                    state["attempts"] = int(state["attempts"]) + 1
                    self.save_state(state)
                    if state["attempts"] >= MAX_TASK_ATTEMPTS:
                        raise RunnerError(
                            f"Task {task.number:02d} failed {MAX_TASK_ATTEMPTS} attempts; "
                            f"last error: {error}"
                        ) from error
                    print(
                        f"Task {task.number:02d} attempt failed: {error}\n"
                        f"Recovery checkpoint created; retrying automatically "
                        f"({state['attempts'] + 1}/{MAX_TASK_ATTEMPTS})."
                    )
            completed += 1
            self.clear_state()
            print(f"{progress_bar(completed, total)} | Task {task.number:02d} complete")
            if owner_gate:
                print(f"Paused after Task {task.number:02d} for required owner acceptance. Rerun to continue.")
                return 0
        print(f"{progress_bar(total, total)} | All tasks complete")
        return 0

    def recover(self) -> str | None:
        if self.active_task is not None:
            reset_task_status(self.active_task)
        return checkpoint_dirty_tree(self.root)

    def load_state(self, task: Task | None = None) -> dict[str, Any] | None:
        if self.state_path.exists():
            try:
                state = json.loads(self.state_path.read_text())
            except json.JSONDecodeError as error:
                raise RunnerError(f"Invalid task-runner state: {error}") from error
            state_task = state.get("task") if isinstance(state, dict) else None
            if isinstance(state_task, str) and (task is None or state_task == str(task.path.relative_to(self.root))):
                base_head = state.get("base_head")
                attempts = state.get("attempts")
                recovery_commits = state.get("recovery_commits", [])
                if (
                    isinstance(base_head, str)
                    and isinstance(attempts, int)
                    and isinstance(recovery_commits, list)
                    and all(isinstance(commit, str) for commit in recovery_commits)
                ):
                    state["recovery_commits"] = recovery_commits
                    if run_git(self.root, "cat-file", "-e", f"{base_head}^{{commit}}", check=False).returncode == 0:
                        return state
            raise RunnerError("Invalid or mismatched active task-runner state")

        if task is not None and task.status_note.startswith("Incomplete — task runner stopped"):
            relative_task = str(task.path.relative_to(self.root))
            commits = run_git(self.root, "log", "--format=%H", "--", relative_task).stdout.splitlines()
            recovery_commit = next((
                commit for commit in commits
                if run_git(self.root, "show", "-s", "--format=%s", commit).stdout.strip() == RECOVERY_COMMIT_MESSAGE
            ), None)
            if recovery_commit is None:
                raise RunnerError(f"Task {task.number:02d} is incomplete but its recovery commit was not found")
            base_head = run_git(self.root, "rev-parse", f"{recovery_commit}^").stdout.strip()
            state = {
                "task": relative_task,
                "base_head": base_head,
                "recovery_commits": [recovery_commit],
                "attempts": 1,
            }
            self.save_state(state)
            print(f"Resuming Task {task.number:02d} from recovery checkpoint; review base {base_head[:8]}.")
            return state
        return None

    def save_state(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, indent=2) + "\n")
        temporary.replace(self.state_path)

    def clear_state(self) -> None:
        if self.state_path.exists():
            self.state_path.unlink()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path, help="Folder containing numbered Markdown tasks")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show task order and planned work without changing Git or starting Codex",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        root = git_root(Path.cwd())
        folder = args.folder.resolve()
        try:
            folder.relative_to(root)
        except ValueError as error:
            raise RunnerError(f"Task folder must be inside the Git repository: {folder}") from error
        runner = TaskRunner(root, folder, dry_run=args.dry_run)
        try:
            return runner.run()
        except KeyboardInterrupt:
            if not args.dry_run:
                runner.recover()
            return 130
        except RunnerInterrupted:
            if not args.dry_run:
                runner.recover()
            return 130
        except RunnerError:
            if not args.dry_run:
                runner.recover()
            raise
    except RunnerError as error:
        print(f"Task runner stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
