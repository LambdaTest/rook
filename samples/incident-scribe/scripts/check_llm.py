"""Prove the model provider in `.env` works: keys present, endpoint up, auth accepted.

    python scripts/check_llm.py               # all three checks
    python scripts/check_llm.py --config-only # keys only, no network call

Exit codes: 0 all good · 1 not configured · 2 endpoint up but credentials
refused · 3 endpoint unreachable or the request was rejected.

Secrets are never printed: only the NAMES of the variables that are set.
"""

from __future__ import annotations

import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from incident_scribe.__main__ import _load_dotenv  # noqa: E402
from incident_scribe import llm  # noqa: E402

_load_dotenv()

# Variable names each provider reads, so the report can say which are set.
VARIABLES = {
    "anthropic": ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "GLM_API_KEY", "ZAI_API_KEY", "ANTHROPIC_MODEL", "GLM_MODEL"),
    "gemini": ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_ENDPOINT"),
    "chat": ("OPENAI_API_KEY", "OPENAI_INDIA_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_MODEL", "OPENAI_CHAT_ENDPOINT", "OPENAI_BASE_URL"),
    "responses": ("OPENAI_ENDPOINT", "OPENAI_INDIA_API_KEY", "OPENAI_MODEL"),
    "lambdatest": ("GATEWAY_URL", "LT_USERNAME", "LT_ACCESS_KEY", "LT_MODEL"),
}


def _paint(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() and "NO_COLOR" not in os.environ else text


def ok(message: str) -> None:
    print(f"  {_paint('32', 'ok')} {message}")


def bad(message: str) -> None:
    print(f"  {_paint('31', '!!')} {message}")


def info(message: str) -> None:
    print(f"  {message}")


def gateway_health(endpoint: str) -> bool:
    """GET <gateway origin>/healthz — unauthenticated, so it isolates "is it up" from "are my keys good"."""
    parts = urllib.parse.urlsplit(endpoint)
    url = f"{parts.scheme}://{parts.netloc}/healthz"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            ok(f"health: {url} answered {response.status}")
            return True
    except urllib.error.HTTPError as error:
        bad(f"health: {url} answered {error.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        bad(f"health: {url} unreachable — {error}")
    return False


def main() -> int:
    config_only = "--config-only" in sys.argv[1:]

    # 1. keys present
    try:
        provider, endpoint, _key, model = llm._config()
    except llm.ModelError as error:
        bad(f"no usable model configuration: {error}")
        return 1
    present = [name for name in VARIABLES.get(provider, ()) if os.environ.get(name, "").strip()]
    ok(f"provider '{provider}', model '{model}', endpoint {endpoint}")
    ok("credentials present: " + ", ".join(present))
    if config_only:
        return 0

    # 2. health. The gateway has a dedicated probe; other providers are judged
    # by the request below, since a 401 from them already proves they are up.
    probed = provider == "lambdatest"
    if probed and not gateway_health(endpoint):
        return 3

    # 3. one tiny real request. Any HTTP answer, even a refusal, proves the
    # endpoint is up; only a 2xx proves the credentials are accepted.
    os.environ.setdefault("LLM_RETRIES", "0")
    started = time.monotonic()
    try:
        llm.call([llm.user("Reply with the single word: ok")], max_output_tokens=64)
    except llm.ModelError as error:
        message = str(error)
        answered = re.search(r"model answered (\d{3})", message)
        if answered and answered.group(1) in {"401", "403"}:
            if not probed:
                ok(f"health: endpoint is up ({answered.group(1)} answered)")
            bad(f"auth: credentials were refused — check the key/username in .env ({message[:200]})")
            return 2
        if answered:
            if not probed:
                ok(f"health: endpoint is up ({answered.group(1)} answered)")
            bad(f"auth: could not be confirmed, the request was rejected — {message[:300]}")
            return 3
        bad(f"health: endpoint unreachable — {message[:300]}")
        return 3
    seconds = time.monotonic() - started
    if not probed:
        ok(f"health: endpoint is up ({seconds:.1f}s round trip)")
    ok(f"auth: credentials accepted, the model answered ({seconds:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
