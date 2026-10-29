"""Make sure .env holds a usable SCRIBE_API_TOKEN, without touching anything else.

    python scripts/ensure_token.py [path-to-.env]      # default: ./.env

Fills the first active SCRIBE_API_TOKEN line when it is empty, and appends one when
there is none (a missing line, or only a commented-out one). A token that is set is
left alone. Prints "generated" or "kept". Hex, because a token that starts with "-"
is parsed as an option by `--token "$SCRIBE_API_TOKEN"`.
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path


def ensure(text: str) -> tuple[str, bool]:
    """Same reading as the desk's .env loader: first assignment wins, quotes are stripped."""
    lines = text.splitlines(keepends=True)
    for index, raw in enumerate(lines):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() != "SCRIBE_API_TOKEN":
            continue
        if value.strip().strip('"').strip("'"):
            return text, False
        ending = raw[len(raw.rstrip("\r\n")):]
        lines[index] = f"SCRIBE_API_TOKEN={secrets.token_hex(24)}{ending}"
        return "".join(lines), True
    newline = "\r\n" if "\r\n" in text else "\n"
    separator = "" if not text or text.endswith("\n") else newline
    return f"{text}{separator}SCRIBE_API_TOKEN={secrets.token_hex(24)}{newline}", True


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
    with path.open(encoding="utf-8", newline="") as handle:
        text = handle.read()
    new, generated = ensure(text)
    if generated:
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(new)
    print("generated" if generated else "kept")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
