#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$PluginsDir = Join-Path $ClaudeDir "plugins"
$MarketplacesFile = Join-Path $PluginsDir "known_marketplaces.json"
$InstalledFile = Join-Path $PluginsDir "installed_plugins.json"

Write-Host "=== cli-hud uninstaller ===" -ForegroundColor Cyan
Write-Host ""

# 1. Remove statusline configuration
if (Get-Command bun -ErrorAction SilentlyContinue) {
    try {
        bun (Join-Path $ScriptDir "src" "index.ts") disable 2>$null
    } catch {}
}

# 2. Remove from known_marketplaces.json
if (Test-Path $MarketplacesFile) {
    $marketplaces = Get-Content $MarketplacesFile -Raw | ConvertFrom-Json -AsHashtable
    $marketplaces.Remove("cli-hud-local")
    $marketplaces | ConvertTo-Json -Depth 10 | Set-Content $MarketplacesFile -Encoding UTF8
    Write-Host "Removed marketplace: cli-hud-local"
}

# 3. Remove from installed_plugins.json
if (Test-Path $InstalledFile) {
    $installed = Get-Content $InstalledFile -Raw | ConvertFrom-Json -AsHashtable
    if ($installed.plugins) {
        $installed.plugins.Remove("cli-hud@cli-hud-local")
    }
    $installed | ConvertTo-Json -Depth 10 | Set-Content $InstalledFile -Encoding UTF8
    Write-Host "Removed plugin: cli-hud@cli-hud-local"
}

Write-Host ""
Write-Host "cli-hud uninstalled. Please restart Claude Code." -ForegroundColor Green
Write-Host "  To delete files: Remove-Item -Recurse -Force $ScriptDir"
