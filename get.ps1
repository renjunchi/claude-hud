#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Repo = "ssh://git@10.10.2.124:2222/junchi.ren/claude-hud.git"
$Target = Join-Path $env:USERPROFILE ".claude" "plugins" "claude-hud"

Write-Host "=== claude-hud bootstrap ===" -ForegroundColor Cyan
Write-Host ""

if (Test-Path (Join-Path $Target ".git")) {
    Write-Host "Updating existing installation..."
    git -C $Target pull --ff-only
} elseif (Test-Path $Target) {
    Write-Host "Directory exists but is not a git repo. Re-cloning..."
    Remove-Item -Recurse -Force $Target
    git clone $Repo $Target
} else {
    Write-Host "Fresh install..."
    $parent = Split-Path -Parent $Target
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    git clone $Repo $Target
}

& (Join-Path $Target "install.ps1")
