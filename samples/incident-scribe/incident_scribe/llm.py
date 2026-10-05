"""Provider adapter with one transcript/tool contract for the agent."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any


class ModelError(RuntimeError):
    """The model could not be reached, or refused."""


ANTHROPIC = {"anthropic", "glm", "zai"}
RESPONSES = {"responses", "azure", "azure_responses", "openai_responses"}
CHAT = {"chat", "chat_completions", "openai", "openai_chat"}
GEMINI = {"gemini", "google", "google_gemini"}


def _config() -> tuple[str, str, str, str]:
    requested = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if not requested:
        if any(os.environ.get(name, "").strip() for name in ("ANTHROPIC_BASE_URL", "GLM_API_KEY", "ZAI_API_KEY")):
            requested = "anthropic"
        elif os.environ.get("GEMINI_API_KEY", "").strip():
            requested = "gemini"
        elif os.environ.get("OPENAI_ENDPOINT", "").strip():
            requested = "responses"
        else:
            requested = "chat"

    if requested in ANTHROPIC:
        endpoint = os.environ.get("ANTHROPIC_BASE_URL", "https://api.z.ai/api/anthropic").strip()
        key = next((os.environ.get(name, "").strip() for name in (
            "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "GLM_API_KEY", "ZAI_API_KEY"
        ) if os.environ.get(name, "").strip()), "")
        model = next((os.environ.get(name, "").strip() for name in (
            "ANTHROPIC_MODEL", "GLM_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL"
        ) if os.environ.get(name, "").strip()), "")
        model = model.split("[", 1)[0]
        if not key or not model:
            raise ModelError("the Anthropic/GLM model needs an auth token and model")
        return "anthropic", endpoint, key, model

    if requested in GEMINI:
        endpoint = os.environ.get("GEMINI_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta").strip()
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        model = os.environ.get("GEMINI_MODEL", "").strip()
        if not key or not model:
            raise ModelError("the Gemini model needs GEMINI_API_KEY and GEMINI_MODEL")
        return "gemini", endpoint.rstrip("/"), key, model

    if requested in CHAT:
        endpoint = os.environ.get("OPENAI_CHAT_ENDPOINT", "").strip()
        if not endpoint:
            endpoint = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
        key = next((os.environ.get(name, "").strip() for name in (
            "OPENAI_API_KEY", "OPENAI_INDIA_API_KEY"
        ) if os.environ.get(name, "").strip()), "")
        model = next((os.environ.get(name, "").strip() for name in (
            "OPENAI_CHAT_MODEL", "OPENAI_MODEL"
        ) if os.environ.get(name, "").strip()), "")
        if not key or not model:
            raise ModelError("the Chat Completions model needs an API key and model")
        return "chat", _chat_url(endpoint), key, model

    if requested not in RESPONSES:
        raise ModelError(f"unknown LLM_PROVIDER: {requested}")
    endpoint = os.environ.get("OPENAI_ENDPOINT", "").strip()
    key = os.environ.get("OPENAI_INDIA_API_KEY", "").strip()
    model = os.environ.get("OPENAI_MODEL", "").strip()
    missing = [name for name, value in (
        ("OPENAI_ENDPOINT", endpoint), ("OPENAI_INDIA_API_KEY", key), ("OPENAI_MODEL", model)
    ) if not value]
    if missing:
        raise ModelError("the Responses model is not configured: " + ", ".join(missing))
    return "responses", endpoint, key, model


def _chat_url(base: str) -> str:
    base = base.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + ("/chat/completions" if base.endswith("/v1") else "/v1/chat/completions")


def _anthropic_url(base: str) -> str:
    base = base.rstrip("/")
    return base if base.endswith("/messages") else base + "/v1/messages"


def _json_args(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {"__unparsed__": value}
    except (TypeError, json.JSONDecodeError):
        return {"__unparsed__": value}


def _anthropic_items(items: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    system_parts: list[str] = []
    messages: list[dict[str, Any]] = []
    for item in items:
        kind, role = item.get("type"), item.get("role")
        if role in {"developer", "system"}:
            content = item.get("content", "")
            system_parts.append(content if isinstance(content, str) else json.dumps(content))
        elif role in {"user", "assistant"}:
            messages.append({"role": role, "content": item.get("content", "")})
        elif kind == "function_call_output":
            messages.append({"role": "user", "content": [{
                "type": "tool_result", "tool_use_id": item.get("call_id"), "content": item.get("output", "")
            }]})
        elif kind == "function_call":
            messages.append({"role": "assistant", "content": [{
                "type": "tool_use", "id": item.get("call_id") or item.get("id"),
                "name": item.get("name"), "input": _json_args(item.get("arguments"))
            }]})
    return "\n\n".join(system_parts), messages


def _anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{
        "name": tool["name"], "description": tool.get("description", ""),
        "input_schema": tool.get("parameters", {"type": "object", "properties": {}})
    } for tool in tools]


def _chat_content(content: Any) -> Any:
    if not isinstance(content, list):
        return content or ""
    text = "\n".join(block.get("text", "") for block in content if block.get("type") in {"text", "output_text"})
    return text


def _chat_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for item in items:
        kind, role = item.get("type"), item.get("role")
        if role in {"developer", "system"}:
            messages.append({"role": "system", "content": item.get("content", "")})
        elif role in {"user", "assistant"}:
            message = {"role": "assistant" if role == "assistant" else role, "content": _chat_content(item.get("content", ""))}
            if item.get("tool_calls"):
                message["tool_calls"] = item["tool_calls"]
            messages.append(message)
        elif kind == "function_call_output":
            messages.append({"role": "tool", "tool_call_id": item.get("call_id"), "content": item.get("output", "")})
        elif kind == "function_call":
            messages.append({"role": "assistant", "content": None, "tool_calls": [{
                "id": item.get("call_id") or item.get("id"), "type": "function",
                "function": {"name": item.get("name"), "arguments": item.get("arguments", "{}")}
            }]})
    return messages


def _chat_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"type": "function", "function": {
        "name": tool["name"], "description": tool.get("description", ""),
        "parameters": tool.get("parameters", {"type": "object", "properties": {}})
    }} for tool in tools]


def _gemini_parts(item: dict[str, Any], pending: list[str]) -> list[dict[str, Any]]:
    content = item.get("content", "")
    if item.get("tool_calls"):
        parts = []
        for call in item["tool_calls"]:
            function = call.get("function", {})
            pending.append(function.get("name", ""))
            parts.append({"functionCall": {"name": function.get("name"), "args": _json_args(function.get("arguments"))}})
        return parts
    if isinstance(content, list):
        parts = []
        for block in content:
            if block.get("type") in {"text", "output_text"}:
                parts.append({"text": block.get("text", "")})
            elif block.get("type") == "tool_use":
                pending.append(block.get("name", ""))
                parts.append({"functionCall": {"name": block.get("name"), "args": block.get("input", {})}})
        return parts
    return [{"text": content or ""}]


def _gemini_items(items: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []
    pending_names: list[str] = []
    for item in items:
        kind, role = item.get("type"), item.get("role")
        if role in {"developer", "system"}:
            content = item.get("content", "")
            system_parts.append(content if isinstance(content, str) else json.dumps(content))
        elif kind == "function_call_output":
            name = pending_names.pop(0) if pending_names else item.get("call_id", "tool")
            output = item.get("output", "")
            try:
                output = json.loads(output)
            except (TypeError, json.JSONDecodeError):
                output = {"result": output}
            contents.append({"role": "user", "parts": [{"functionResponse": {"name": name, "response": output}}]})
        elif kind == "function_call":
            name = item.get("name", "")
            pending_names.append(name)
            contents.append({"role": "model", "parts": [{"functionCall": {"name": name, "args": _json_args(item.get("arguments"))}}]})
        elif role in {"user", "assistant", "model"}:
            gemini_role = "model" if role == "assistant" else "user"
            if "parts" in item:
                parts = item.get("parts") or []
                for part in parts:
                    if part.get("functionCall"):
                        pending_names.append(part["functionCall"].get("name", ""))
            else:
                parts = _gemini_parts(item, pending_names)
            contents.append({"role": gemini_role, "parts": parts})
    return "\n\n".join(system_parts), contents


def _gemini_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"functionDeclarations": [{
        "name": tool["name"], "description": tool.get("description", ""),
        "parameters": tool.get("parameters", {"type": "object", "properties": {}})
    } for tool in tools]}]


def _timeout_seconds() -> float:
    configured = os.environ.get("LLM_TIMEOUT", "").strip()
    return float(configured) if configured else float(os.environ.get("API_TIMEOUT_MS", "120000")) / 1000


def _request(url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    retries = max(0, int(os.environ.get("LLM_RETRIES", "1")))
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=_timeout_seconds()) as response:
                data = json.load(response)
            if data.get("error"):
                raise ModelError(f"model returned an error: {data['error']}")
            return data
        except urllib.error.HTTPError as error:
            detail = error.read()[:400].decode("utf-8", "replace")
            raise ModelError(f"model answered {error.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt >= retries:
                raise ModelError(f"could not reach the model: {error}") from None
            time.sleep(0.25 * (attempt + 1))
    raise ModelError("model request failed")


def _call_anthropic(items: list[dict[str, Any]], tools: list[dict[str, Any]] | None, endpoint: str, key: str, model: str, max_tokens: int) -> dict[str, Any]:
    system, messages = _anthropic_items(items)
    body: dict[str, Any] = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if system:
        body["system"] = system
    if tools:
        body["tools"] = _anthropic_tools(tools)
    data = _request(_anthropic_url(endpoint), body, {
        "content-type": "application/json", "x-api-key": key,
        "Authorization": f"Bearer {key}", "anthropic-version": "2023-06-01"
    })
    blocks = data.get("content", [])
    calls = [{"call_id": block.get("id"), "name": block.get("name"), "arguments": block.get("input") or {}} for block in blocks if block.get("type") == "tool_use"]
    usage = data.get("usage") or {}
    return {"text": "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip(), "tool_calls": calls, "raw_output": [{"role": "assistant", "content": blocks}], "stop_reason": data.get("stop_reason"), "usage": {"input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0)}}


def _call_chat(items: list[dict[str, Any]], tools: list[dict[str, Any]] | None, endpoint: str, key: str, model: str, max_tokens: int) -> dict[str, Any]:
    body: dict[str, Any] = {"model": model, "messages": _chat_items(items), "max_tokens": max_tokens}
    if tools:
        body["tools"] = _chat_tools(tools)
    data = _request(endpoint, body, {"content-type": "application/json", "Authorization": f"Bearer {key}"})
    message = (data.get("choices") or [{}])[0].get("message") or {}
    calls = []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        calls.append({"call_id": call.get("id"), "name": function.get("name"), "arguments": _json_args(function.get("arguments"))})
    raw = {"role": "assistant", "content": message.get("content") or ""}
    if message.get("tool_calls"):
        raw["tool_calls"] = message["tool_calls"]
    usage = data.get("usage") or {}
    return {"text": message.get("content") or "", "tool_calls": calls, "raw_output": [raw], "stop_reason": (data.get("choices") or [{}])[0].get("finish_reason"), "usage": {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0)}}


def _call_gemini(items: list[dict[str, Any]], tools: list[dict[str, Any]] | None, endpoint: str, key: str, model: str, max_tokens: int) -> dict[str, Any]:
    system, contents = _gemini_items(items)
    body: dict[str, Any] = {"contents": contents, "generationConfig": {"maxOutputTokens": max_tokens}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if tools:
        body["tools"] = _gemini_tools(tools)
    url = f"{endpoint}/models/{model}:generateContent"
    data = _request(url, body, {"content-type": "application/json", "x-goog-api-key": key})
    candidate = (data.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts", [])
    calls = []
    for index, part in enumerate(parts):
        function = part.get("functionCall")
        if function:
            calls.append({"call_id": f"gemini_call_{index}", "name": function.get("name"), "arguments": function.get("args") or {}})
    usage = data.get("usageMetadata") or {}
    return {"text": "\n".join(part.get("text", "") for part in parts if part.get("text")).strip(), "tool_calls": calls, "raw_output": [{"role": "model", "parts": parts}], "stop_reason": candidate.get("finishReason"), "usage": {"input_tokens": usage.get("promptTokenCount", 0), "output_tokens": usage.get("candidatesTokenCount", 0)}}


def call(items: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None, max_output_tokens: int = 1200) -> dict[str, Any]:
    provider, endpoint, key, model = _config()
    if provider == "anthropic":
        return _call_anthropic(items, tools, endpoint, key, model, max_output_tokens)
    if provider == "chat":
        return _call_chat(items, tools, endpoint, key, model, max_output_tokens)
    if provider == "gemini":
        return _call_gemini(items, tools, endpoint, key, model, max_output_tokens)

    body: dict[str, Any] = {"model": model, "input": items, "max_output_tokens": max_output_tokens}
    if tools:
        body["tools"] = tools
    data = _request(endpoint, body, {"content-type": "application/json", "api-key": key})
    text_parts: list[str] = []
    calls: list[dict[str, Any]] = []
    for item in data.get("output", []):
        if item.get("type") == "message":
            text_parts.extend(block.get("text", "") for block in item.get("content", []) if block.get("type") == "output_text")
        elif item.get("type") == "function_call":
            calls.append({"call_id": item.get("call_id") or item.get("id"), "name": item.get("name"), "arguments": _json_args(item.get("arguments"))})
    usage = data.get("usage") or {}
    return {"text": "\n".join(part for part in text_parts if part).strip(), "tool_calls": calls, "raw_output": data.get("output", []), "stop_reason": data.get("status"), "usage": {"input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0)}}


def user(text: str) -> dict[str, Any]:
    return {"role": "user", "content": text}


def system(text: str) -> dict[str, Any]:
    return {"role": "developer", "content": text}


def tool_result(call_id: str, output: Any) -> dict[str, Any]:
    return {"type": "function_call_output", "call_id": call_id, "output": json.dumps(output)}
