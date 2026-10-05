#
# Everything incident-scribe needs, proven, in one command - the Windows twin
# of preflight.sh. Runs on Windows PowerShell 5.1 and PowerShell 7.
#
#   powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
#
# NOTHING TO START. ops-directory speaks MCP over stdio, so whoever needs it
# spawns their own copy per session. What is checked: that the credential and
# model are set, that the gate refuses a wrong one, and that the MCP door opens.

Set-Location (Split-Path -Parent $PSScriptRoot)

function Ok($msg)   { Write-Host "  " -NoNewline; Write-Host "ok" -ForegroundColor Green -NoNewline; Write-Host " $msg" }
function Bad($msg)  { Write-Host "  " -NoNewline; Write-Host "!!" -ForegroundColor Red -NoNewline; Write-Host " $msg" }
function Info($msg) { Write-Host "  $msg" }

# `python3` on Windows is often the Microsoft Store stub; `python` is the real one.
$python = $null
foreach ($candidate in 'python', 'python3') {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
        & $cmd.Source -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) { $python = $cmd.Source; break }
    }
}

Write-Host ""
Write-Host "incident-scribe - preflight"
Write-Host ""

if (-not $python) { Bad "Python 3.9+ is not on PATH (python / python3)"; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Bad "node is not on PATH, and ops-directory runs on it"; exit 1 }

# --- 1. the credential ----------------------------------------------------
$tokenInEnv = [bool]$env:SCRIBE_API_TOKEN
$tokenInFile = (Test-Path .env) -and [bool](Select-String -Path .env -Pattern '^SCRIBE_API_TOKEN=' -Quiet)
if (-not ($tokenInEnv -or $tokenInFile)) { Bad "SCRIBE_API_TOKEN is set neither in the environment nor in .env"; exit 1 }
Ok "the token is configured"

# --- 2. the model configuration ------------------------------------------
& $python -c "from incident_scribe.__main__ import _load_dotenv; _load_dotenv(); from incident_scribe.llm import _config; _config()" 2>$null
if ($LASTEXITCODE -ne 0) { Bad "the model provider is not configured"; exit 1 }
Ok "the model provider is configured"

# --- 3. the gate refuses a wrong token ------------------------------------
$refused = (& $python -m incident_scribe logs --session-id _preflight --token wrong-token 2>$null) -join "`n"
if ($refused -match '"unauthorized"') {
    Ok "the token gate is on (a wrong token is refused)"
} else {
    Bad "a wrong token was NOT refused - the gate is not working"; Info $refused; exit 1
}

# --- 4. the MCP door opens ------------------------------------------------
$frames = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' + "`n" + '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
$mcpOut = ($frames | node services/ops-directory.mjs mcp 2>$null) -join "`n"
if (($mcpOut -match '"name":"search_incidents"') -and ($mcpOut -match '"name":"index_incident"')) {
    Ok "mcp handshake ok - lookup_service, recent_incidents, search_incidents, index_incident"
} else {
    Bad "the MCP server did not list its tools"; exit 1
}

# --- 5. semantic search is armed (soft - lexical mode is a valid fallback) --
if ((Test-Path services/incidents.index.json) -and (Test-Path node_modules) -and (Test-Path .models)) {
    Ok "semantic search armed - index and model cache present (mode: semantic)"
} else {
    Info "search_incidents will run in lexical mode - for embeddings: npm install; node scripts/build-index.mjs"
}

# --- 6. the desk can actually reach it ------------------------------------
& $python -c "from incident_scribe.mcp import directory; r = directory().call('lookup_service', {'name': 'checkout-api'}); raise SystemExit(0 if r.get('owning_team') == 'payments' else 1)" 2>$null
if ($LASTEXITCODE -ne 0) { Bad "the desk could not reach ops-directory over MCP"; exit 1 }
Ok "the desk reaches the directory (checkout-api -> payments)"

Write-Host ""
Write-Host "  ready. nothing is running, and nothing needs to be."
Write-Host ""
