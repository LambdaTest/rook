#
# One-command setup for the sample agents on Windows - the twin of setup.sh.
# Runs on Windows PowerShell 5.1 and PowerShell 7.
#
#   powershell -ExecutionPolicy Bypass -File setup.ps1                 set up EVERYTHING (the one command; run it from anywhere)
#   powershell -ExecutionPolicy Bypass -File setup.ps1 incident-scribe  or just the samples you name
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -NoSemantic      skip the embeddings download
#
# Safe to re-run: an existing .env is kept, and a token is only generated where
# the file has none.
#
# What each sample needs:
#   incident-scribe       Python 3.9+, Node, a .env with a token and a model provider
#   industry-agents       Node 22+, npm install, one .env per demo
#   refund-desk, triage-service, knowledge-vault, trip-weather-station
#                         Node only - nothing to install

param(
    [switch]$NoSemantic,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Samples
)

Set-Location $PSScriptRoot

$All = 'incident-scribe', 'industry-agents', 'refund-desk', 'triage-service', 'knowledge-vault', 'trip-weather-station'

function Ok($msg)   { Write-Host "  " -NoNewline; Write-Host "ok" -ForegroundColor Green -NoNewline; Write-Host " $msg" }
function Bad($msg)  { Write-Host "  " -NoNewline; Write-Host "!!" -ForegroundColor Red -NoNewline; Write-Host " $msg" }
function Info($msg) { Write-Host "  $msg" }
function Head($msg) { Write-Host ""; Write-Host $msg -ForegroundColor White }

if (-not $Samples) { $Samples = $All }
foreach ($s in $Samples) {
    if ($All -notcontains $s) { Bad "unknown sample: $s (choose from: $($All -join ', '))"; exit 2 }
}

$failed = @()

# `python3` on Windows is often the Microsoft Store stub; `python` is the real one.
$python = $null
foreach ($candidate in 'python', 'python3') {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
        & $cmd.Source -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) { $python = $cmd.Source; break }
    }
}

Head "sample agents - setup"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Bad "node is not on PATH (https://nodejs.org)"; exit 1 }
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
$nodeMinor = [int](node -p "process.versions.node.split('.')[1]")
Ok "node $(node --version)"

function Setup-IncidentScribe {
    Head "incident-scribe"
    if (-not $python) { Bad "Python 3.9+ is not on PATH (python / python3)"; $script:failed += 'incident-scribe'; return }
    Ok (& $python --version)

    Push-Location incident-scribe
    try {
        if (-not (Test-Path .env)) {
            Copy-Item .env.example .env
            Ok "created .env from .env.example"
        } else {
            Ok "kept existing .env"
        }

        if ((& $python scripts\ensure_token.py .env) -eq 'generated') {
            Ok "generated SCRIBE_API_TOKEN in .env"
        } else {
            Ok "SCRIBE_API_TOKEN already set"
        }

        & $python scripts\prompt_credentials.py .env

        if (-not $NoSemantic) {
            Info "installing embeddings (downloads a model, a few minutes)..."
            npm install --no-audit --no-fund *> $null
            $installed = ($LASTEXITCODE -eq 0)
            if ($installed) { node scripts/build-index.mjs *> $null; $installed = ($LASTEXITCODE -eq 0) }
            if ($installed) { Ok "semantic search armed" } else { Bad "embedding install failed - search_incidents will fall back to lexical mode" }
        } else {
            Info "search_incidents will run in lexical mode (-NoSemantic was given; re-run without it for embeddings)"
        }

        # keys present -> endpoint up -> credentials accepted (exit 1 / 3 / 2 when not)
        & $python scripts\check_llm.py
        switch ($LASTEXITCODE) {
            0 {
                & powershell -NoProfile -ExecutionPolicy Bypass -File scripts\preflight.ps1
                if ($LASTEXITCODE -ne 0) { $script:failed += 'incident-scribe' }
                else { Info "next: cd incident-scribe; . .\scripts\env.ps1    (loads .env, including SCRIBE_API_TOKEN, into your session)" }
            }
            1 {
                Info "next: complete the provider settings named above in incident-scribe\.env, then re-run setup.ps1 incident-scribe"
                Info "      (the LambdaTest template needs LT_USERNAME and LT_ACCESS_KEY; an older .env keeps its own LLM_PROVIDER)."
            }
            default { Bad "the model provider is configured but did not pass - fix .env and re-run"; $script:failed += 'incident-scribe' }
        }
    } finally {
        Pop-Location
    }
}

function Setup-IndustryAgents {
    Head "industry-agents"
    if ($nodeMajor -lt 22) { Bad "needs Node 22+, found $(node --version)"; $script:failed += 'industry-agents'; return }
    Push-Location industry-agents
    try {
        npm install --no-audit --no-fund *> $null
        if ($LASTEXITCODE -ne 0) { Bad "npm install failed"; $script:failed += 'industry-agents'; return }
        Ok "dependencies installed"
        npm run setup --silent | ForEach-Object { Info $_ }
        if ($LASTEXITCODE -ne 0) { Bad "npm run setup failed"; $script:failed += 'industry-agents'; return }
        Info "next: add MODEL_API_KEY to the demo .env you want to run (demos\*\.env)"
    } finally {
        Pop-Location
    }
}

foreach ($sample in $Samples) {
    switch ($sample) {
        'incident-scribe' { Setup-IncidentScribe }
        'industry-agents' { Setup-IndustryAgents }
        default {
            Head $sample
            # knowledge-vault and trip-weather-station import node:sqlite, unflagged from Node 22.13
            $needsSqlite = $sample -in 'knowledge-vault', 'trip-weather-station'
            if ($needsSqlite -and ($nodeMajor -lt 22 -or ($nodeMajor -eq 22 -and $nodeMinor -lt 13))) {
                Bad "needs Node 22.13+ for node:sqlite, found $(node --version)"; $failed += $sample
            } else {
                Ok "nothing to install"
            }
        }
    }
}

Write-Host ""
if ($failed.Count -gt 0) { Bad "needs attention: $($failed -join ', ')"; exit 1 }
Info "done."
Write-Host ""
