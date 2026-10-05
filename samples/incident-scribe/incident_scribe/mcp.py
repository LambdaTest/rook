"""Reaching ops-directory over MCP.

The desk used to call the directory over HTTP. It now speaks MCP — the same
two operations, the same process, the other door — and the reason is not
tidiness.

A harness grading this desk can open the SAME MCP server and ask
`lookup_service` itself: who really owns checkout-api, what tier is it really.
That only means something if the desk's answer and the grader's question come
from one source of truth. Over HTTP the MCP door was something only a grader
used, so it was a second interface nobody's answer depended on — a check that
proved the two copies agreed rather than that the desk was right.

JSON-RPC 2.0 over the server's stdin/stdout, no SDK: a dependency here would
put `pip install` between this desk and its first answer.

Replies are read by a background thread rather than waited on with
`select.select`: on Windows `select` only accepts sockets, never a pipe, so a
desk built on it could not reach the directory there at all.
"""

from __future__ import annotations

import collections
import json
import os
import queue
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any


class McpError(RuntimeError):
    """The server could not be started, or would not answer."""


class OpsDirectory:
    """One MCP session against ops-directory, held open for the process.

    Started once and reused: a stdio server is a subprocess, and paying to
    spawn one per tool call would make the desk's own latency a property of
    how many lookups it happened to do.
    """

    def __init__(self, command: list[str] | None = None, cwd: str | None = None) -> None:
        self._command = command or self._default_command()
        self._cwd = cwd or str(Path(__file__).resolve().parent.parent)
        self._proc: subprocess.Popen[str] | None = None
        # Filled by the reader threads of the CURRENT process; replaced on
        # every restart so a dead server's leftovers never answer a new call.
        self._replies: queue.Queue[str] = queue.Queue()
        self._stderr_tail: collections.deque[str] = collections.deque(maxlen=20)
        self._next_id = 0
        self._timeout = float(os.environ.get("MCP_TIMEOUT", "30"))
        # One in-flight request at a time. The desk's tool loop is sequential,
        # and a lock is cheaper than correlating replies out of order.
        self._lock = threading.Lock()

    @staticmethod
    def _default_command() -> list[str]:
        node = shutil.which("node")
        if not node:
            raise McpError("node is not on PATH, and ops-directory runs on it")
        return [node, "services/ops-directory.mjs", "mcp"]

    # --- the session -----------------------------------------------------
    def _start(self) -> subprocess.Popen[str]:
        if self._proc and self._proc.poll() is None:
            return self._proc
        try:
            self._proc = subprocess.Popen(
                self._command,
                cwd=self._cwd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                # Kept separate: the server writes diagnostics there, and
                # folding them into stdout would corrupt the protocol.
                stderr=subprocess.PIPE,
                text=True,
                # Node speaks UTF-8; without this Windows decodes with the
                # locale code page and a non-ASCII incident summary breaks.
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as err:
            raise McpError(f"could not start ops-directory: {err}") from None

        self._replies = queue.Queue()
        self._stderr_tail = collections.deque(maxlen=20)
        threading.Thread(target=self._pump, args=(self._proc.stdout, self._replies.put), daemon=True).start()
        # stderr is drained too: an unread pipe fills up and stalls the server.
        threading.Thread(target=self._pump, args=(self._proc.stderr, self._stderr_tail.append), daemon=True).start()

        self._rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "incident-scribe", "version": "1.0.0"},
        })
        self._notify("notifications/initialized")
        return self._proc

    @staticmethod
    def _pump(stream, sink) -> None:
        """Copy lines from one of the server's pipes until it closes.

        End of stream is passed on as "" so a waiting call learns the server
        died instead of sitting out the whole timeout.
        """
        try:
            for line in iter(stream.readline, ""):
                sink(line)
        except (OSError, ValueError):
            pass
        sink("")

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        proc = self._proc
        if proc is None or proc.stdin is None or proc.stdout is None:
            raise McpError("ops-directory is not running")

        self._next_id += 1
        frame = {"jsonrpc": "2.0", "id": self._next_id, "method": method}
        if params is not None:
            frame["params"] = params

        try:
            proc.stdin.write(json.dumps(frame) + "\n")
            proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            raise McpError("ops-directory closed its input") from None

        # One line per frame, and the server sends nothing unsolicited, so the
        # next line is this call's reply.
        try:
            line = self._replies.get(timeout=self._timeout)
        except queue.Empty:
            try:
                proc.kill()
            except OSError:
                pass
            self._proc = None
            raise McpError(f"ops-directory timed out after {self._timeout:g}s") from None
        if not line:
            self._proc = None
            try:
                proc.wait(timeout=2)  # let the stderr pump catch the last words
            except Exception:
                pass
            err = "".join(line for line in self._stderr_tail if line)
            raise McpError(f"ops-directory stopped answering. {err.strip()[:200]}")

        try:
            reply = json.loads(line)
        except json.JSONDecodeError:
            raise McpError(f"ops-directory sent something that is not JSON: {line[:160]}") from None

        if "error" in reply:
            raise McpError(f"ops-directory refused {method}: {reply['error']}")
        return reply.get("result") or {}

    def _notify(self, method: str) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None:
            return
        try:
            proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method}) + "\n")
            proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass

    # --- what the desk uses ----------------------------------------------
    def tools(self) -> list[dict[str, Any]]:
        with self._lock:
            self._start()
            return self._rpc("tools/list").get("tools", [])

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """One tool call. Errors come back as data, never as an exception.

        A directory that is down is something the desk should be told about so
        it can say so — not a crash that loses the session around it.
        """
        try:
            with self._lock:
                self._start()
                result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        except McpError as err:
            return {"error": str(err)}

        # MCP returns content blocks. The server puts its JSON in a text block,
        # which is what every client can read without negotiating a schema.
        for block in result.get("content", []):
            if block.get("type") == "text":
                try:
                    return json.loads(block.get("text") or "{}")
                except json.JSONDecodeError:
                    return {"error": "ops-directory returned unreadable content"}
        return {"error": "ops-directory returned no content"}

    def close(self) -> None:
        proc = self._proc
        self._proc = None
        if not proc or proc.poll() is not None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


# One per process. The desk is a CLI: it runs, does a task, exits.
_directory: OpsDirectory | None = None


def directory() -> OpsDirectory:
    global _directory
    if _directory is None:
        _directory = OpsDirectory()
    return _directory
