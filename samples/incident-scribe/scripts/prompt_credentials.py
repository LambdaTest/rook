"""Ask for the LambdaTest username and access key when .env has none, and save them.

    python scripts/prompt_credentials.py [path-to-.env]      # default: ./.env

Asks only on a terminal, only for a LambdaTest setup, and only for a value that is
neither set in the shell nor filled in .env. The access key is typed hidden. An
empty answer skips that value. Nothing it reads is ever printed.
"""

from __future__ import annotations

import getpass
import os
import sys
from pathlib import Path

PROMPTS = (("LT_USERNAME", False), ("LT_ACCESS_KEY", True))


def first_assignment(text: str, key: str) -> tuple[int | None, str]:
    """Same reading as the desk's .env loader: first assignment wins, quotes are stripped."""
    for index, raw in enumerate(text.splitlines()):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip() == key:
            return index, value.strip().strip('"').strip("'")
    return None, ""


def set_value(text: str, key: str, value: str) -> str:
    """Fill the first active line for `key`, or append one."""
    index, _ = first_assignment(text, key)
    lines = text.splitlines(keepends=True)
    if index is not None:
        raw = lines[index]
        lines[index] = f"{key}={value}{raw[len(raw.rstrip(chr(13) + chr(10))):]}"
        return "".join(lines)
    newline = "\r\n" if "\r\n" in text else "\n"
    separator = "" if not text or text.endswith("\n") else newline
    return f"{text}{separator}{key}={value}{newline}"


def wants_lambdatest(text: str) -> bool:
    provider = (os.environ.get("LLM_PROVIDER") or first_assignment(text, "LLM_PROVIDER")[1]).strip().lower()
    return provider in ("lambdatest", "lt")


def ask(key: str, hidden: bool) -> str:
    if hidden:
        return getpass.getpass(f"  {key} (hidden): ").strip()
    sys.stdout.write(f"  {key}: ")
    sys.stdout.flush()
    return sys.stdin.readline().strip()


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
    with path.open(encoding="utf-8", newline="") as handle:
        text = handle.read()
    if not wants_lambdatest(text) or not sys.stdin.isatty():
        return 0

    saved = []
    for key, hidden in PROMPTS:
        if os.environ.get(key, "").strip() or first_assignment(text, key)[1]:
            continue
        answer = ask(key, hidden)
        if answer and "\n" not in answer and "\r" not in answer:
            text = set_value(text, key, answer)
            saved.append(key)
    if saved:
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        print(f"  ok saved {', '.join(saved)} to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
