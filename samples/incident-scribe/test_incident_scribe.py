import json

from incident_scribe.agent import TOOLS, _clean_note, _policy_severity, _reported_severity, _status
from incident_scribe.llm import _anthropic_items, _anthropic_tools, _config, _gemini_items, tool_result


def test_tools_declare_search_incidents():
    by_name = {t["name"]: t for t in TOOLS}
    assert set(by_name) == {"lookup_service", "recent_incidents", "search_incidents"}
    assert by_name["search_incidents"]["parameters"]["required"] == ["query"]


def test_index_incident_flywheel(tmp_path, monkeypatch):
    """index → searchable (even by paraphrase) → idempotent → durable."""
    import incident_scribe.mcp as mcp_mod
    from incident_scribe.mcp import OpsDirectory

    monkeypatch.setenv("OPS_LEARNED_FILE", str(tmp_path / "learned.json"))
    mcp_mod._directory = None  # the singleton must spawn with the test's env

    record = {
        "id": "INC-L-test-flywheel",
        "session_id": "test-flywheel",
        "service": "checkout-api",
        "severity": "S2",
        "summary": "Gift card balance lookup fails",
        "symptoms": "Customers cannot apply gift card balances at checkout; the balance lookup request times out",
    }
    d = OpsDirectory()
    try:
        assert "index_incident" in {t["name"] for t in d.tools()}
        out = d.call("index_incident", {"record": record})
        assert out.get("indexed") is True and out["searchable"] == "semantic"
        assert out["corpus_size"] == 5

        # A paraphrase sharing no words with the summary finds the learned record.
        s = d.call("search_incidents", {"query": "promo code or voucher not applying at the payment step"})
        assert s["incidents"][0]["id"] == "INC-L-test-flywheel"

        # It is a real incident now: visible in history too, and idempotent.
        assert any(i["id"] == "INC-L-test-flywheel" for i in d.call("recent_incidents", {"service": "checkout-api"})["incidents"])
        again = d.call("index_incident", {"record": dict(record, summary="different text, same id")})
        assert again.get("indexed") is False and again["reason"] == "already in the corpus"

        # Validation comes back as data, not as a crash.
        assert d.call("index_incident", {"record": {"service": "no-such-svc", "severity": "S2", "summary": "x"}}).get("error")
        assert d.call("index_incident", {"record": {"service": "checkout-api", "severity": "S9", "summary": "x"}}).get("error")
        assert d.call("index_incident", {"record": {"service": "checkout-api", "severity": "S1"}}).get("error")
    finally:
        d.close()

    # Durability: a freshly spawned server (as any later session would) still
    # finds the learned record, from the persisted file alone.
    d2 = OpsDirectory()
    try:
        s2 = d2.call("search_incidents", {"query": "gift card balance cannot be applied"})
        assert s2["incidents"][0]["id"] == "INC-L-test-flywheel"
    finally:
        d2.close()


def test_close_ingests_latest_record(tmp_path, monkeypatch):
    """`close`'s helper picks the highest-numbered record artifact and indexes it."""
    import incident_scribe.mcp as mcp_mod
    from incident_scribe import __main__ as cli
    from incident_scribe.__main__ import Session

    monkeypatch.setenv("OPS_LEARNED_FILE", str(tmp_path / "learned.json"))
    monkeypatch.setattr(cli, "SESSION_ROOT", tmp_path / "sessions")
    mcp_mod._directory = None

    session = Session("close-test")
    session.open()
    try:
        assert cli._index_latest_record(session) is None  # nothing to teach yet
        session.write_artifact(
            "incident-record-close-test-001.json",
            json.dumps({"session_id": "close-test", "service": "notify-worker", "severity": "S2", "assessment": "STATUS: COMPLETE\nPush notification delivery is failing for many users."}),
        )
        # Realistic assessment: markers, a bare markdown heading, an internal
        # contact bullet, then the substance. None of the first three may
        # become the record's summary.
        session.write_artifact(
            "incident-record-close-test-002.json",
            json.dumps({
                "session_id": "close-test",
                "service": "checkout-api",
                "severity": "S1",
                "assessment": (
                    "STATUS: COMPLETE\nSEVERITY: S1\n\n**Assessment**\n\n"
                    "- **Service:** checkout-api (tier 1) — on-call: payments-oncall@x, runbook: https://runbooks.internal/ca\n"
                    "- **Severity:** S1 — the checkout service is unavailable and money is being lost on charge attempts."
                ),
            }),
        )
        out = cli._index_latest_record(session)
        assert out and out.get("indexed") is True and out["id"] == "INC-L-close-test"
        # The record with the HIGHER turn number wins.
        assert out["service"] == "checkout-api"

        learned = json.loads((tmp_path / "learned.json").read_text())
        stored = learned["records"][0]["incident"]
        assert "money is being lost" in stored["summary"]
        assert "**Assessment**" not in stored["summary"]
        assert not stored["symptoms"].startswith("STATUS:")
        assert "money is being lost" in stored["symptoms"]
    finally:
        session.log("session_closed")
        mcp_mod._directory = None


def test_ops_directory_semantic_search(tmp_path, monkeypatch):
    """search_incidents through the same MCP door the desk and a grader use."""
    import incident_scribe.mcp as mcp_mod
    from incident_scribe.mcp import OpsDirectory

    # An isolated learned corpus: these assertions are about the curated
    # index, and must not depend on — or pollute — whatever the flywheel has
    # learned into the live incidents.learned.json.
    monkeypatch.setenv("OPS_LEARNED_FILE", str(tmp_path / "learned.json"))
    mcp_mod._directory = None
    d = OpsDirectory()
    try:
        assert "search_incidents" in {t["name"] for t in d.tools()}

        # A paraphrase sharing almost no words with the stored summary: this is
        # the case date-ordered recent_incidents cannot answer.
        r = d.call("search_incidents", {"query": "shoppers cannot complete payment, card charges timing out"})
        assert r["mode"] in {"semantic", "lexical"}
        assert r["incidents"][0]["id"] == "INC-2041"
        assert "root_cause" in r["incidents"][0]

        filtered = d.call("search_incidents", {"query": "customers report missing notifications", "service": "notify-worker"})
        assert filtered["incidents"], "the service filter should not empty a service with history"
        assert all(i["service"] == "notify-worker" for i in filtered["incidents"])
        assert filtered["incidents"][0]["id"] == "INC-2110"

        assert d.call("search_incidents", {"query": ""}).get("error")
        # Out-of-range limits clamp like recent_incidents clamps — the server
        # is lenient-but-predictable; the desk's own validation is the strict
        # layer and rejects them before the server is ever asked.
        clamped = d.call("search_incidents", {"query": "anything", "limit": 99})
        assert "error" not in clamped and len(clamped["incidents"]) <= 10
    finally:
        d.close()


def test_anthropic_transcript_and_tools():
    system, messages = _anthropic_items([
        {"role": "developer", "content": "rules"},
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "lookup_service", "input": {"name": "checkout-api"}}]},
        tool_result("t1", {"found": True}),
    ])
    assert system == "rules"
    assert messages[-1]["content"][0]["tool_use_id"] == "t1"
    assert _anthropic_tools([{"name": "x", "description": "d", "parameters": {"type": "object"}}])[0]["input_schema"]["type"] == "object"


def test_reported_severity_reads_marker_not_history():
    """The desk's claim is the SEVERITY marker line — not the first S-code in
    the prose, which may be a cited past incident or a comparison."""
    text = "Unlike INC-2041 (an S1 outage on checkout-api), this is lower intensity.\nSEVERITY: S2\nMore prose."
    assert _reported_severity(text) == "S2"
    # No marker line: the legacy whole-text fallback still applies.
    assert _reported_severity("we estimate S3 impact") == "S3"
    assert _reported_severity("no codes here") is None


def test_policy_guard_runs_on_the_report(tmp_path, monkeypatch):
    """The severity guard validates the model's row against the REPORT's own
    wording — never against the assessment prose, which legitimately mentions
    other rows in order to negate them ("rather than single-user impact",
    "no evidence of money or data loss"). Regression: flywheel-a2, where a
    correct S2 assessment was destroyed by its own hedging."""
    import incident_scribe.llm as llm_mod
    from incident_scribe import __main__ as cli_mod
    from incident_scribe import agent

    assessment = (
        "STATUS: COMPLETE\nSEVERITY: S2\n\n"
        "Webhook deliveries on notify-worker are failing for all merchants. "
        "This is broad, sustained degradation rather than single-user impact. "
        "It does not reach S1 (no evidence of money or data loss)."
    )

    def fake_llm_call(items, tools=None, max_output_tokens=None):
        return {
            "text": assessment,
            "tool_calls": [],
            "raw_output": [{"role": "assistant", "content": [{"type": "output_text", "text": assessment}]}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }

    monkeypatch.setattr(llm_mod, "call", fake_llm_call)
    monkeypatch.setattr(cli_mod, "SESSION_ROOT", tmp_path / "sessions")
    s = cli_mod.Session("guard-test")
    s.open()
    try:
        s.write_json("state.json", {"service_record": {"name": "notify-worker", "tier": 2, "owning_team": "platform", "runbook_url": "https://runbooks.internal/nw", "on_call": "nw-oncall@x"}})
        # The REPORT states what happened; it contains no keyword cue for any
        # row, so the model's S2 must stand and the turn must complete.
        result = agent.run_turn(s, "notify-worker webhook deliveries are failing for all merchants since this morning")
        assert result["status"] == "completed", result["answer"][:200]
        assert result["severity"] == "S2"
        assert result["note_file"]

        # The guard must STILL bite when the report itself is unambiguous and
        # the model's row contradicts it: money being lost is S1, model said S2.
        def fake_llm_s2(items, tools=None, max_output_tokens=None):
            return {
                "text": "STATUS: COMPLETE\nSEVERITY: S2\nCharges are failing.",
                "tool_calls": [],
                "raw_output": [{"role": "assistant", "content": [{"type": "output_text", "text": "STATUS: COMPLETE\nSEVERITY: S2"}]}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }

        monkeypatch.setattr(llm_mod, "call", fake_llm_s2)
        s.write_json("state.json", {"service_record": {"name": "checkout-api", "tier": 1, "owning_team": "payments", "runbook_url": "https://runbooks.internal/ca", "on_call": "ca-oncall@x"}})
        result2 = agent.run_turn(s, "checkout-api is failing and money is being lost on charge attempts")
        assert result2["status"] == "needs_input"
        assert result2["severity"] is None
    finally:
        s.log("session_closed")


def test_policy_guards():
    assert _status("STATUS: NEEDS_INPUT\nWhat service?") == "needs_input"
    assert _status("STATUS: COMPLETE\nS2") == "completed"
    note = _clean_note("Users see S2. See https://internal/runbook and ops@example.com", {"runbook_url": "https://internal/runbook", "on_call": "ops@example.com"})
    assert "S2" not in note and "https://internal/runbook" not in note and "ops@example.com" not in note
    assert _policy_severity(3, "the service is degraded") == "S3"
    assert _policy_severity(1, "the service is unavailable") == "S1"
    assert _policy_severity(2, "degraded for many users") == "S2"


def test_zai_claude_guide_aliases(monkeypatch):
    # The alias is only consulted when no higher-precedence model variable is
    # set — delete them explicitly, since importing the CLI elsewhere in this
    # file runs _load_dotenv and pollutes the process environment.
    for name in ("ANTHROPIC_MODEL", "GLM_MODEL", "ANTHROPIC_API_KEY", "GLM_API_KEY", "ZAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "glm")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "test")
    monkeypatch.setenv("ANTHROPIC_DEFAULT_SONNET_MODEL", "glm-5.3[1m]")
    assert _config()[0] == "anthropic"
    assert _config()[3] == "glm-5.3"


def test_chat_and_gemini_tool_shapes(monkeypatch):
    from incident_scribe import llm

    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("OPENAI_CHAT_MODEL", "chat-model")
    monkeypatch.setattr(llm, "_request", lambda *args: {"choices": [{"message": {"content": "", "tool_calls": [{"id": "c1", "function": {"name": "lookup", "arguments": '{"name":"x"}'}}]}, "finish_reason": "tool_calls"}], "usage": {"prompt_tokens": 1, "completion_tokens": 2}})
    assert llm.call([llm.user("find")], tools=[{"name": "lookup", "parameters": {"type": "object"}}])["tool_calls"][0]["call_id"] == "c1"

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-model")
    monkeypatch.setattr(llm, "_request", lambda *args: {"candidates": [{"content": {"parts": [{"functionCall": {"name": "lookup", "args": {"name": "x"}}}]}, "finishReason": "TOOL_CALL"}], "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 2}})
    result = llm.call([llm.user("find")], tools=[{"name": "lookup", "parameters": {"type": "object"}}])
    _, contents = _gemini_items(result["raw_output"] + [tool_result(result["tool_calls"][0]["call_id"], {"ok": True})])
    assert contents[-1]["parts"][0]["functionResponse"]["name"] == "lookup"
