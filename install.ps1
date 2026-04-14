#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$PluginsDir = Join-Path $ClaudeDir "plugins"
$MarketplacesFile = Join-Path $PluginsDir "known_marketplaces.json"
$InstalledFile = Join-Path $PluginsDir "installed_plugins.json"

Write-Host "=== cli-hud installer ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check bun
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "bun not found. Install it first:" -ForegroundColor Red
    Write-Host "  powershell -c `"irm bun.sh/install.ps1 | iex`""
    exit 1
}

# 2. Install dependencies
Push-Location $ScriptDir
try {
    bun install --frozen-lockfile 2>$null
    if ($LASTEXITCODE -ne 0) { bun install }
} catch {
    bun install
}
Pop-Location

# 3. Ensure plugins directory exists
if (-not (Test-Path $PluginsDir)) {
    New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null
}

# 4. Register in known_marketplaces.json
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")

$marketplaces = @{}
if (Test-Path $MarketplacesFile) {
    $marketplaces = Get-Content $MarketplacesFile -Raw | ConvertFrom-Json -AsHashtable
}
$marketplaces["cli-hud-local"] = @{
    source = @{ source = "directory"; path = $ScriptDir }
    installLocation = $ScriptDir
    lastUpdated = $now
}
$marketplaces | ConvertTo-Json -Depth 10 | Set-Content $MarketplacesFile -Encoding UTF8
Write-Host "Registered marketplace: cli-hud-local"

# 5. Register in installed_plugins.json
$installed = @{ version = 2; plugins = @{} }
if (Test-Path $InstalledFile) {
    $installed = Get-Content $InstalledFile -Raw | ConvertFrom-Json -AsHashtable
}

# Read version
$ver = "0.1.0"
$pluginJsonPath = Join-Path $ScriptDir ".claude-plugin" "plugin.json"
if (Test-Path $pluginJsonPath) {
    $pluginMeta = Get-Content $pluginJsonPath -Raw | ConvertFrom-Json
    if ($pluginMeta.version) { $ver = $pluginMeta.version }
}

# Read git sha
$sha = "unknown"
try {
    $sha = (git -C $ScriptDir rev-parse HEAD 2>$null).Trim()
} catch {}

$installed.plugins["cli-hud@cli-hud-local"] = @(
    @{
        scope = "user"
        installPath = $ScriptDir
        version = $ver
        installedAt = $now
        lastUpdated = $now
        gitCommitSha = $sha
    }
)
$installed | ConvertTo-Json -Depth 10 | Set-Content $InstalledFile -Encoding UTF8
Write-Host "Registered plugin: cli-hud@cli-hud-local"

# 6. Configure statusline
bun (Join-Path $ScriptDir "src" "index.ts") enable

Write-Host ""
Write-Host "cli-hud installed successfully!" -ForegroundColor Green
Write-Host "  Commands: /cli-hud:enable, /cli-hud:disable, /cli-hud:report"
Write-Host "  Please restart Claude Code to activate."
