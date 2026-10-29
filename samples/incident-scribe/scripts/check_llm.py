"""Prove the model provider in `.env` works: keys present, endpoint up, auth accepted.

    python scripts/check_llm.py               # all three checks
    python scripts/check_llm.py --config-only # keys only, no network call

Exit codes: 0 all good · 1 not configured · 2 endpoint up but credentials
refused · 3 endpoint unreachable or the request was rejected.

Secrets are never printed: only the NAMES of the variables that are set.
"""

from __future__ import annotations

import os
import sys
import time
import urllib.error
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


def gateway_health() -> bool:
    """GET <GATEWAY_URL>/healthz — unauthenticated, so it isolates "is it up" from "are my keys good".

    A gateway with no such route (404) is not a failure; the credential check below still decides.
    """
    url = os.environ["GATEWAY_URL"].strip().rstrip("/") + "/healthz"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            ok(f"health: {url} answered {response.status}")
            return True
    except urllib.error.HTTPError as error:
        if error.code == 404:
            info(f"health: {url} has no health route, relying on the credential check")
            return True
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
    if probed and not gateway_health():
        return 3

    # 3. one tiny real request. Any HTTP answer, even a refusal, proves the
    # endpoint is up; only a 2xx proves the credentials are accepted.
    os.environ.setdefault("LLM_RETRIES", "0")
    started = time.monotonic()
    try:
        llm.call([llm.user("Reply with the single word: ok")], max_output_tokens=64)
    except llm.ModelError as error:
        message = str(error)
        if error.status is None:
            bad(f"health: endpoint unreachable — {message[:300]}")
            return 3
        if not probed:
            ok(f"health: endpoint is up ({error.status} answered)")
        if error.status in (401, 403):
            bad(f"auth: credentials were refused — check the key/username in .env ({message[:200]})")
            return 2
        bad(f"auth: could not be confirmed, the request was rejected — {message[:300]}")
        return 3
    except Exception as error:  # an unexpected answer must never read as "not configured" (exit 1)
        bad(f"the endpoint answered something unexpected — {type(error).__name__}: {str(error)[:300]}")
        return 3
    seconds = time.monotonic() - started
    if not probed:
        ok(f"health: endpoint is up ({seconds:.1f}s round trip)")
    ok(f"auth: credentials accepted, the model answered ({seconds:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
