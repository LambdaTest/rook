# Load .env into the current PowerShell session. Dot-source it, do not run it:
#
#   . .\scripts\env.ps1 [path-to-.env]      # default: .\.env
#
# Follows the desk's loader: the first assignment of a name wins, and a variable
# already set in the session wins over the file.

param([string]$Path = '.env')

if (-not (Test-Path $Path)) { Write-Error "env.ps1: no such file: $Path"; return }

foreach ($line in [System.IO.File]::ReadAllLines((Resolve-Path $Path), [System.Text.UTF8Encoding]::new($false))) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { continue }
    $key, $value = $line -split '=', 2
    $key = ($key -replace '^export\s+', '').Trim()
    if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
    if (Test-Path "env:$key") { continue }
    Set-Item -Path "env:$key" -Value $value.Trim().Trim('"').Trim("'")
}
