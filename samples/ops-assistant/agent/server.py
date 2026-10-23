"""Ops Assistant: FastAPI front door + LLM tool-calling loop + MCP stdio clients.

Every POST endpoint takes {"input": "..."}, runs the same agent, and returns the
result in a different format (JSON, text, async job, NDJSON, SSE, WebSocket).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import mcp
from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from mcp import StdioServerParameters
from mcp.client.stdio import get_default_environment
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# LLM_PROVIDER picks which .env variables configure the Anthropic-format API.
PROVIDERS = {
    "glm": {"api_key": "GLM_API_KEY", "model": "GLM_MODEL", "base_url": "GLM_BASE_URL"},
}
MAX_TOOL_ROUNDS = 5
MAX_TOKENS = 4096  # room for the model's thinking plus the answer
MOCK_API_URL = os.environ.get("MOCK_API_URL", "http://127.0.0.1:9200")
MCP_SERVERS = ["data-server", "jobs-server"]

SYSTEM_PROMPT = """You are Ops Assistant, the internal operations assistant for Acme Retail.
You answer questions about orders, incidents, service logs, service status and reports.
Always use the tools to get facts; never invent order, incident, log or status data.
If a tool reports an error (for example an unknown ID), say so plainly.
Keep answers short and factual. Services: checkout, payments, inventory, search."""

log = logging.getLogger("ops-assistant")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set; add it to {ROOT / '.env'}")
    return value


@dataclass
class AgentResult:
    output: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


class ChatRequest(BaseModel):
    input: str


class Agent:
    """Holds the LLM client and one MCP client per Node MCP server."""

    def __init__(self) -> None:
        self.provider = require_env("LLM_PROVIDER").lower()
        names = PROVIDERS.get(self.provider)
        if names is None:
            raise RuntimeError(f"LLM_PROVIDER={self.provider!r} is not supported; use one of: {', '.join(PROVIDERS)}")
        self.model = require_env(names["model"])
        self.llm = AsyncAnthropic(api_key=require_env(names["api_key"]), base_url=require_env(names["base_url"]))
        self.clients: dict[str, mcp.Client] = {}  # tool name -> client
        self.tools: list[dict[str, Any]] = []  # Anthropic tool definitions

    async def connect(self, stack: AsyncExitStack) -> None:
        node = shutil.which("node") or "node"
        # Pass a minimal environment so the MCP servers never see the LLM key.
        env = {**get_default_environment(), "MOCK_API_URL": MOCK_API_URL}
        for server in MCP_SERVERS:
            params = StdioServerParameters(command=node, args=[str(ROOT / "mcp" / f"{server}.mjs")], env=env, cwd=str(ROOT))
            client = await stack.enter_async_context(mcp.Client(params))
            listing = await client.list_tools()
            for tool in listing.tools:
                self.clients[tool.name] = client
                self.tools.append({"name": tool.name, "description": tool.description or "", "input_schema": tool.input_schema})
            log.info("MCP %s: %s", server, ", ".join(t.name for t in listing.tools))

    async def call_tool(self, name: str, args: dict[str, Any]) -> tuple[bool, str]:
        """Run one MCP tool. Returns (ok, text for the model)."""
        client = self.clients.get(name)
        if client is None:
            return False, f"Unknown tool: {name}"

        async def on_progress(progress: float, total: float | None, message: str | None) -> None:
            log.info("  progress %s: %s %s", name, progress, message or "")

        try:
            result = await client.call_tool(name, args, progress_callback=on_progress)
        except Exception as exc:  # transport or protocol failure
            return False, f"Tool {name} failed: {exc}"

        parts: list[str] = []
        for block in result.content:
            if block.type == "text":
                parts.append(block.text)
            else:
                parts.append(f"[{block.type} content omitted]")
        if result.structured_content is not None:
            parts.append("Structured result: " + json.dumps(result.structured_content))
        return not result.is_error, "\n".join(parts)

    async def run(self, user_input: str) -> AsyncIterator[dict[str, Any]]:
        """Run the tool-calling loop, yielding tool_call, delta, error and done events."""
        messages: list[dict[str, Any]] = [{"role": "user", "content": user_input}]
        result = AgentResult()
        try:
            for round_no in range(MAX_TOOL_ROUNDS + 1):
                # After MAX_TOOL_ROUNDS rounds of tools, force a final text answer.
                tool_choice = {"type": "auto" if round_no < MAX_TOOL_ROUNDS else "none"}
                text: list[str] = []
                async with self.llm.messages.stream(
                    model=self.model, max_tokens=MAX_TOKENS, system=SYSTEM_PROMPT, messages=messages,
                    tools=self.tools, tool_choice=tool_choice,
                    extra_body={"temperature": 0},  # this SDK version has no temperature parameter
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_delta" and event.delta.type == "text_delta":
                            text.append(event.delta.text)
                            yield {"type": "delta", "text": event.delta.text}
                    message = await stream.get_final_message()

                tool_uses = [block for block in message.content if block.type == "tool_use"]
                if not tool_uses:
                    result.output = "".join(text)
                    break

                # Send every block back unchanged: thinking blocks must accompany their tool_use.
                messages.append({"role": "assistant", "content": [block.model_dump(exclude_none=True) for block in message.content]})
                tool_results = []
                for use in tool_uses:
                    args = use.input if isinstance(use.input, dict) else {}
                    ok, tool_text = await self.call_tool(use.name, args)
                    record = {"name": use.name, "args": args, "ok": ok}
                    result.tool_calls.append(record)
                    yield {"type": "tool_call", **record}
                    tool_results.append({"type": "tool_result", "tool_use_id": use.id, "content": tool_text, "is_error": not ok})
                messages.append({"role": "user", "content": tool_results})
        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"
            log.exception("agent run failed")
            yield {"type": "error", "message": result.error}

        done: dict[str, Any] = {
            "type": "done",
            "output": result.output,
            "tool_calls": result.tool_calls,
            "_result": result,  # stripped before sending; lets collect() return the full result
        }
        yield done


agent: Agent | None = None
jobs: dict[str, dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    global agent
    async with AsyncExitStack() as stack:
        agent = Agent()
        await agent.connect(stack)
        log.info("Ops Assistant ready: provider=%s model=%s, %d tools", agent.provider, agent.model, len(agent.tools))
        yield


app = FastAPI(title="Ops Assistant", lifespan=lifespan)


def public(event: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in event.items() if not k.startswith("_")}


async def logged_events(endpoint: str, user_input: str) -> AsyncIterator[dict[str, Any]]:
    """Run the agent and log endpoint, tools called and duration when it finishes."""
    started = time.perf_counter()
    tools: list[str] = []
    try:
        async for event in agent.run(user_input):
            if event["type"] == "tool_call":
                tools.append(event["name"] if event["ok"] else f"{event['name']}(error)")
            yield event
    finally:
        log.info("%s tools=[%s] %.2fs", endpoint, ", ".join(tools), time.perf_counter() - started)


async def collect(endpoint: str, user_input: str) -> AgentResult:
    result = AgentResult()
    async for event in logged_events(endpoint, user_input):
        if event["type"] == "done":
            result = event["_result"]
    return result


def tool_calls_header(result: AgentResult) -> dict[str, str]:
    """Report tool calls on responses whose body can't carry them (plain text).

    json.dumps escapes non-ASCII by default, so the value is always a valid header.
    """
    return {"X-Tool-Calls": json.dumps(result.tool_calls, separators=(",", ":"))}


def error_response(result: AgentResult) -> JSONResponse:
    return JSONResponse({"error": "agent_failed", "detail": result.error, "tool_calls": result.tool_calls}, status_code=502)


@app.get("/health")
async def health():
    return {"ok": True, "provider": agent.provider, "model": agent.model, "tools": [t["name"] for t in agent.tools]}


@app.post("/v1/chat")
async def chat_json(req: ChatRequest):
    result = await collect("POST /v1/chat", req.input)
    if result.error:
        return error_response(result)
    return {"output": result.output, "tool_calls": result.tool_calls}


@app.post("/v1/chat/text")
async def chat_text(req: ChatRequest):
    result = await collect("POST /v1/chat/text", req.input)
    if result.error:
        return PlainTextResponse(f"Error: {result.error}", status_code=502)
    return PlainTextResponse(result.output, headers=tool_calls_header(result))


@app.post("/v1/chat/async", status_code=202)
async def chat_async(req: ChatRequest):
    job_id = uuid.uuid4().hex
    jobs[job_id] = {"status": "pending"}

    async def work() -> None:
        result = await collect("POST /v1/chat/async", req.input)
        if result.error:
            jobs[job_id] = {"status": "error", "error": result.error, "tool_calls": result.tool_calls}
        else:
            jobs[job_id] = {"status": "done", "output": result.output, "tool_calls": result.tool_calls}

    jobs[job_id]["task"] = asyncio.create_task(work())
    return {"job_id": job_id}


@app.get("/v1/jobs/{job_id}")
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        return JSONResponse({"error": "unknown job"}, status_code=404)
    return public({k: v for k, v in job.items() if k != "task"})


@app.post("/v1/chat/ndjson")
async def chat_ndjson(req: ChatRequest):
    async def body():
        async for event in logged_events("POST /v1/chat/ndjson", req.input):
            yield json.dumps(public(event)) + "\n"

    return StreamingResponse(body(), media_type="application/x-ndjson")


@app.post("/v1/chat/sse")
async def chat_sse(req: ChatRequest):
    async def body():
        async for event in logged_events("POST /v1/chat/sse", req.input):
            yield f"data: {json.dumps(public(event))}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(body(), media_type="text/event-stream", headers={"cache-control": "no-cache"})


@app.websocket("/v1/chat/ws")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        message = await ws.receive_json()
        user_input = message.get("input") if isinstance(message, dict) else None
        if not isinstance(user_input, str) or not user_input:
            await ws.send_json({"type": "error", "message": 'expected {"input": "..."}'})
            await ws.close(code=1003)
            return
        async for event in logged_events("WS /v1/chat/ws", user_input):
            await ws.send_json(public(event))
        await ws.close()
    except WebSocketDisconnect:
        log.info("WS /v1/chat/ws client disconnected")
