$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " TobyTube Windows Migration Setup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  Write-Host "Node.js is not installed yet." -ForegroundColor Yellow
  Write-Host "Opening the official Node.js download page." -ForegroundColor Yellow
  Write-Host "Install the LTS version, then run this setup file again." -ForegroundColor Yellow
  Start-Process "https://nodejs.org/en/download"
  exit 1
}

Write-Host "Node.js found: $(& $node.Source --version)" -ForegroundColor Green
$windowsReadyMarker = Join-Path $root ".tobytube-windows-ready"
$nodeModulesPath = Join-Path $root "node_modules"
if ((Test-Path -LiteralPath $nodeModulesPath -PathType Container) -and -not (Test-Path -LiteralPath $windowsReadyMarker)) {
  $backupPath = Join-Path $root "node_modules-linux-backup"
  if (Test-Path -LiteralPath $backupPath) {
    $backupPath = Join-Path $root ("node_modules-linux-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  }
  Write-Host "Preserving the old Linux dependencies as $(Split-Path $backupPath -Leaf)..." -ForegroundColor Cyan
  Move-Item -LiteralPath $nodeModulesPath -Destination $backupPath
}
Write-Host "Installing Windows-compatible TobyTube components..." -ForegroundColor Cyan
& $npm.Source install
if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
Set-Content -LiteralPath $windowsReadyMarker -Value (Get-Date -Format "o") -Encoding ASCII

$defaultMediaRoot = "D:\Media"
$answer = Read-Host "Where is the Media folder on this PC? Press Enter for $defaultMediaRoot"
$mediaRoot = if ([string]::IsNullOrWhiteSpace($answer)) { $defaultMediaRoot } else { $answer.Trim().Trim('"') }
$mediaRoot = [System.IO.Path]::GetFullPath($mediaRoot)

if (-not (Test-Path -LiteralPath $mediaRoot -PathType Container)) {
  Write-Host ""
  Write-Host "That folder does not exist: $mediaRoot" -ForegroundColor Red
  Write-Host "Connect the media drive or correct the path, then run setup again." -ForegroundColor Yellow
  exit 1
}

$categories = @("Movies", "TV", "Wrestling")
$mediaSources = @()
foreach ($category in $categories) {
  $candidate = Join-Path $mediaRoot $category
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $sourceType = switch ($category) { "Movies" { "movie" } "TV" { "tv" } "Wrestling" { "wrestling" } }
    $mediaSources += [ordered]@{ id = $category.ToLowerInvariant(); type = $sourceType; path = $candidate }
  } else {
    Write-Host "Warning: $candidate was not found and will not be scanned." -ForegroundColor Yellow
  }
}
if ($mediaSources.Count -eq 0) {
  $mediaSources = @([ordered]@{ id = "temporary-media"; type = "mixed"; path = $mediaRoot })
}

$localConfigPath = Join-Path $root "config\tobytube.local.json"
if (Test-Path -LiteralPath $localConfigPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -LiteralPath $localConfigPath -Destination "$localConfigPath.$stamp.backup" -Force
}

$localConfig = [ordered]@{
  scanOnStartup = $true
  watchMediaRoots = $true
  watchDebounceMs = 4000
  refreshProviders = $false
  refreshNewProviders = $true
  providerBackfillLimit = 25
  mediaSources = $mediaSources
}
$localConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $localConfigPath -Encoding UTF8

Write-Host ""
Write-Host "Checking TobyTube files..." -ForegroundColor Cyan
& $npm.Source test
if ($LASTEXITCODE -ne 0) { throw "TobyTube's file check failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "Setup is complete." -ForegroundColor Green
Write-Host "Media folders:" -ForegroundColor Green
$mediaSources | ForEach-Object { Write-Host "  $($_.type): $($_.path)" }
Write-Host ""
Write-Host "From now on, double-click Launch-Tobytube.cmd to start TobyTube." -ForegroundColor Cyan

$launch = Read-Host "Start TobyTube now? Press Enter for Yes, or type N for No"
if ($launch -notmatch '^[Nn]') {
  Start-Process -FilePath (Join-Path $root "Launch-Tobytube.cmd") -WorkingDirectory $root
}
