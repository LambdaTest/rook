"""incident-scribe, from the command line.

    incident-scribe open    --token T --session-id S
    incident-scribe execute --token T --session-id S     (the task on stdin)
    incident-scribe close   --token T --session-id S
    incident-scribe logs    --token T --session-id S

Four commands, and EVERY ONE takes a token. There is no login step: the token
is issued out of band, lives in `SCRIBE_API_TOKEN`, and is presented on every
call. `logs` and `close` are as protected as `execute` — a desk that hands over
its log without a token has decoration, not auth.

Each command prints one JSON object on stdout. Diagnostics go to stderr.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from . import agent
from .llm import ModelError
from .mcp import directory

SESSION_ROOT = Path(os.environ.get("SCRIBE_STATE_DIR", ".scribe-sessions"))


def _load_dotenv() -> None:
    """Read `.env` beside the package, without a dependency.

    The real environment WINS. A value already exported is one somebody set on
    purpose — a CI job, a harness passing credentials for this run — and a file
    on disk quietly overriding it is how a run ends up testing the wrong
    account with no sign that it did.
    """
    for candidate in (Path.cwd() / ".env", Path(__file__).resolve().parent.parent / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return


_load_dotenv()


def _fail(code: str, message: str, status: int = 1) -> int:
    json.dump({"ok": False, "error": code, "message": message}, sys.stdout)
    sys.stdout.write("\n")
    return status


class Session:
    """One incident session: its log, its artifacts, its lifecycle."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.dir = SESSION_ROOT / session_id
        self.log_path = self.dir / "session.jsonl"
        self.artifacts_dir = self.dir / "artifacts"

    # --- lifecycle -------------------------------------------------------
    def open(self) -> None:
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.log("session_opened")

    def exists(self) -> bool:
        return self.log_path.exists()

    def is_closed(self) -> bool:
        return any(e.get("event") == "session_closed" for e in self.entries())

    # --- the log ---------------------------------------------------------
    def log(self, event: str, **fields) -> None:
        """One JSON line per event.

        Written as it happens rather than buffered to the end: the log exists
        so that a session which DIED still says how far it got, and a buffer
        flushed at exit is exactly the part that does not survive a crash.
        """
        self.dir.mkdir(parents=True, exist_ok=True)
        entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "event": event}
        entry.update(fields)
        with self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")

    def entries(self) -> list[dict]:
        if not self.log_path.exists():
            return []
        out = []
        for line in self.log_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                # A torn final line is a fact about the crash, not a reason to
                # refuse to show the rest of the log.
                out.append({"event": "unparseable_log_line", "raw": line[:200]})
        return out

    def write_artifact(self, name: str, content: str) -> Path:
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        path = (self.artifacts_dir / Path(name).name).resolve()
        if path.parent != self.artifacts_dir.resolve():
            raise ValueError("artifact path escapes the session")
        self._atomic_write(path, content)
        return path

    def read_json(self, name: str, default):
        path = self.dir / name
        if not path.is_file():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self.log("state_recovery", path=str(path), reason="invalid_json")
            return default

    def write_json(self, name: str, value) -> Path:
        path = self.dir / Path(name).name
        self._atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2))
        return path

    @staticmethod
    def _atomic_write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(f".{path.name}.tmp")
        temp.write_text(content, encoding="utf-8")
        temp.replace(path)


_GENERIC_HEADINGS = {"assessment", "summary", "details", "findings", "note", "notes", "followup", "follow-up", "impact", "timeline"}
_METADATA_BULLETS = ("service:", "owning team:", "owning team", "on-call", "runbook:", "tier:")


def _strip_markdown(line: str) -> str:
    return re.sub(r"[*_#>`]+", " ", line).strip(" \t-").strip()


def _corpus_summary(text: str) -> str:
    """The assessment's most informative line, as a corpus summary.

    Skips protocol markers, bare markdown headings, internal-metadata bullets
    (service/owning-team/on-call/runbook), and anything too short to carry
    substance — then prefers the first line long enough to say what actually
    HAPPENED. Without this, a learned record's summary is '**Assessment**' or
    'Service: notify-worker (tier 2)', and a later session reads its top
    search hit as junk and dismisses it (flywheel-b).
    """
    fallback = ""
    for line in (text or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.upper().startswith(("STATUS:", "SEVERITY:")):
            continue
        cleaned = re.sub(r"\s+", " ", _strip_markdown(stripped))
        if not cleaned:
            continue
        # Tidy the double-markering models produce ("Severity: SEVERITY: S2 —").
        cleaned = re.sub(r"^severity:\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\bseverity:\s*(?=S[1-3]\b)", "", cleaned, flags=re.I)
        low = cleaned.lower().rstrip(":")
        if low in _GENERIC_HEADINGS:
            continue
        # Metadata bullets: labels or contact details, not incident substance.
        if low.startswith(_METADATA_BULLETS) or "on-call" in low or "on-call@" in low:
            continue
        if len(cleaned) >= 40:
            return cleaned[:200]
        if not fallback and len(cleaned) >= 8:
            fallback = cleaned[:200]
    return fallback


def _corpus_text(text: str) -> str:
    """The assessment as retrieval surface: protocol markers out, substance in."""
    keep = [
        line for line in (text or "").splitlines()
        if line.strip() and not line.strip().upper().startswith(("STATUS:", "SEVERITY:"))
    ]
    return "\n".join(keep).strip()


def _index_latest_record(session: Session) -> dict | None:
    """The flywheel: a closed session's own incident record becomes corpus.

    Picks the highest-numbered `incident-record-*.json` artifact the desk
    wrote this session and hands it to ops-directory's `index_incident`.
    Returns the server's answer, or None when there is nothing to index —
    a session that never completed has no record, and nothing to teach.
    """
    if not session.artifacts_dir.is_dir():
        return None
    records = sorted(session.artifacts_dir.glob("incident-record-*.json"))
    if not records:
        return None
    try:
        record = json.loads(records[-1].read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not record.get("severity") or not record.get("service"):
        return None  # never a completed assessment — nothing to index
    assessment = record.get("assessment", "")
    return directory().call(
        "index_incident",
        {
            "record": {
                "id": f"INC-L-{session.session_id}",
                "session_id": session.session_id,
                "service": record.get("service"),
                "severity": record.get("severity"),
                "summary": _corpus_summary(assessment),
                "symptoms": _corpus_text(assessment),
                "resolved": time.strftime("%Y-%m-%d"),
            }
        },
    )


def main() -> int:
    ap = argparse.ArgumentParser(prog="incident-scribe")
    sub = ap.add_subparsers(dest="command", required=True)

    for name, help_text in (
        ("open", "start a session"),
        ("execute", "run one task in a session; the task arrives on stdin"),
        ("close", "end a session"),
        ("logs", "the session's log, as JSON"),
    ):
        p = sub.add_parser(name, help=help_text)
        p.add_argument("--token", default=os.environ.get("SCRIBE_API_TOKEN", ""))
        p.add_argument("--session-id", required=True)
    args = ap.parse_args()

    # --- the gate --------------------------------------------------------
    #
    # Checked first, on every command, before the session is even looked at.
    # A desk that answers `logs` without a token has no auth; it has a
    # decoration on `execute`.
    #
    expected = os.environ.get("SCRIBE_API_TOKEN", "")
    if not expected:
        return _fail(
            "not_configured",
            "SCRIBE_API_TOKEN is not set in this environment, so no token can "
            "be correct. Set it and try again.",
        )
    if not args.token:
        return _fail("unauthorized", "no --token supplied; every command needs one")
    if args.token != expected:
        return _fail("unauthorized", "the token supplied is not valid for this desk")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", args.session_id):
        return _fail("invalid_session_id", "session id must contain only letters, numbers, _ or -")

    session = Session(args.session_id)

    if args.command == "open":
        if session.exists():
            return _fail("already_open", f"session {args.session_id} already exists")
        session.open()
        json.dump(
            {"ok": True, "session_id": session.session_id, "state_dir": str(session.dir)},
            sys.stdout,
        )
        sys.stdout.write("\n")
        return 0

    if not session.exists():
        return _fail(
            "no_such_session",
            f"session {args.session_id} was never opened — run `open` first",
        )

    if args.command == "execute":
        if session.is_closed():
            return _fail("session_closed", "this session is closed; open a new one")
        # Read as UTF-8 everywhere. Windows would otherwise decode a piped
        # report with the locale code page, garbling it or failing outright;
        # a BOM some Windows shells prepend is dropped with the whitespace.
        if hasattr(sys.stdin, "reconfigure"):
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        goal = sys.stdin.read().lstrip("﻿").strip()
        if not goal:
            return _fail("empty_task", "the task arrives on stdin, and nothing did")

        session.log("task_received", chars=len(goal))
        if agent.looks_like_injection(goal):
            # Recorded, never obeyed — and recorded BEFORE the model sees it,
            # so the log says the desk noticed even if the model does not.
            session.log("injection_suspected")

        try:
            result = agent.run_turn(session, goal)
        except ModelError as err:
            session.log("model_error", message=str(err)[:300])
            return _fail("model_error", str(err))

        session.log("task_completed")
        json.dump({"ok": True, **result}, sys.stdout)
        sys.stdout.write("\n")
        return 0

    if args.command == "close":
        if session.is_closed():
            return _fail("session_closed", "already closed")
        session.log("session_closed")
        # The flywheel, run at the only moment it makes sense: the session is
        # over, its record is final, and whatever picks incidents up next
        # should be able to find this one. Indexing must never break closing
        # — a failed ingest is logged, not raised.
        try:
            outcome = _index_latest_record(session)
            if outcome:
                fields = {k: outcome[k] for k in ("indexed", "id", "reason", "searchable", "corpus_size", "error") if k in outcome}
                session.log("incident_indexed", **fields)
        except Exception as err:
            session.log("incident_indexing_failed", message=str(err)[:200])
        json.dump({"ok": True, "session_id": session.session_id, "closed": True}, sys.stdout)
        sys.stdout.write("\n")
        return 0

    if args.command == "logs":
        entries = session.entries()
        artifacts = []
        if session.artifacts_dir.exists():
            artifacts = [str(p.resolve()) for p in sorted(session.artifacts_dir.iterdir())]
        json.dump(
            {
                "ok": True,
                "session_id": session.session_id,
                "entries": entries,
                "artifacts": artifacts,
                "log_file": str(session.log_path.resolve()),
            },
            sys.stdout,
        )
        sys.stdout.write("\n")
        return 0

    return _fail("unknown_command", args.command)


if __name__ == "__main__":
    raise SystemExit(main())
