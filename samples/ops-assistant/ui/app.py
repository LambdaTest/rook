"""Streamlit chat page for the Ops Assistant.

Streams answers from the agent's NDJSON endpoint, shows each tool call as it
runs. Start the mock API and the agent first.
Run: .\\.venv\\Scripts\\python -m streamlit run ui\\app.py
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from typing import Any

import httpx
import streamlit as st

AGENT_URL = os.environ.get("AGENT_URL", "http://127.0.0.1:9110")
REQUEST_TIMEOUT = httpx.Timeout(10.0, read=180.0)
EXAMPLES = [
    "What's the status of order A-100?",
    "Summarize incident INC-2041.",
    "Export the weekly report for checkout.",
    "Show me the recent logs for payments.",
    "What's the live status of all services right now?",
]

st.set_page_config(page_title="Ops Assistant", page_icon=":material/support_agent:")


@st.cache_data(ttl=5, show_spinner=False)
def agent_health() -> dict[str, Any] | None:
    try:
        return httpx.get(f"{AGENT_URL}/health", timeout=3).json()
    except (httpx.HTTPError, ValueError):
        return None


def tool_line(call: dict[str, Any]) -> str:
    icon = ":material/check_circle:" if call["ok"] else ":material/error:"
    return f"{icon} `{call['name']}` {json.dumps(call['args'])}"


def show_tools(calls: list[dict[str, Any]]) -> None:
    if calls:
        with st.expander(f"Tools used ({len(calls)})", icon=":material/build:"):
            for call in calls:
                st.markdown(tool_line(call))


def show_message(message: dict[str, Any]) -> None:
    with st.chat_message(message["role"]):
        if message["role"] == "assistant":
            show_tools(message.get("tool_calls", []))
        if message.get("error"):
            st.error(message["error"])
        if message.get("content"):
            st.markdown(message["content"])
        if message.get("seconds") is not None:
            st.caption(f"{message['seconds']:.1f}s")


def stream_answer(prompt: str, run: dict[str, Any], status) -> Iterator[str]:
    """Yield answer text from the NDJSON stream, recording tool calls and the done event."""
    with httpx.stream("POST", f"{AGENT_URL}/v1/chat/ndjson", json={"input": prompt}, timeout=REQUEST_TIMEOUT) as res:
        res.raise_for_status()
        for line in res.iter_lines():
            if not line.strip():
                continue
            event = json.loads(line)
            if event["type"] == "tool_call":
                run["tool_calls"].append(event)
                status.markdown(tool_line(event))
                status.update(label=f"Ran {event['name']}, waiting for the answer...")
            elif event["type"] == "delta":
                yield event["text"]
            elif event["type"] == "error":
                run["error"] = event["message"]
            elif event["type"] == "done":
                run["done"] = event


def answer(prompt: str) -> dict[str, Any]:
    run: dict[str, Any] = {"role": "assistant", "tool_calls": [], "error": None, "done": None}
    started = time.perf_counter()
    with st.chat_message("assistant"):
        status = st.status("Thinking...", expanded=True)
        try:
            run["content"] = st.write_stream(stream_answer(prompt, run, status))
        except httpx.HTTPError as exc:
            run["error"] = f"Could not reach the agent at {AGENT_URL}: {exc}"
        run["seconds"] = time.perf_counter() - started

        calls = run["tool_calls"]
        label = f"Used {len(calls)} tool{'s' if len(calls) != 1 else ''}" if calls else "No tools used"
        status.update(label=label, state="error" if run["error"] else "complete", expanded=False)
        if run["error"]:
            st.error(run["error"])
        st.caption(f"{run['seconds']:.1f}s")
    return run


st.session_state.setdefault("messages", [])

with st.sidebar:
    st.header("Ops Assistant")
    health = agent_health()
    if health:
        st.success(f"Agent connected: {health.get('model')} ({health.get('provider')})", icon=":material/check_circle:")
        st.caption("Tools: " + ", ".join(health.get("tools", [])))
    else:
        st.error(f"Agent not reachable at {AGENT_URL}. Start the mock API and the agent first (see README).",
                 icon=":material/error:")
    st.subheader("Try")
    for example in EXAMPLES:
        if st.button(example, width="stretch"):
            st.session_state.queued = example
    st.divider()
    if st.button("Clear chat", icon=":material/delete:", width="stretch"):
        st.session_state.messages = []
        st.rerun()

st.title("Ops Assistant")
st.caption("Orders, incidents, logs, service status and reports for Acme Retail. "
           "Each message is answered on its own: the agent does not remember earlier messages.")

for message in st.session_state.messages:
    show_message(message)

prompt = st.chat_input("Ask about an order, incident, logs, status or a report") or st.session_state.pop("queued", None)
if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    show_message(st.session_state.messages[-1])
    run = answer(prompt)
    run.pop("done", None)
    st.session_state.messages.append(run)
