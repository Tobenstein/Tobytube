$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$nodeCandidates = @(
  "C:\Users\robpe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  "node.exe",
  "node"
)

$node = $null
foreach ($candidate in $nodeCandidates) {
  $command = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($command) {
    $node = $command.Source
    break
  }
}

if (-not $node) {
  throw "Node.js was not found. Install Node.js or launch from Codex's bundled runtime."
}

Set-Location $root
if (-not $env:PORT) {
  $env:PORT = "8092"
}

Write-Host "Tobytube launching at http://127.0.0.1:$env:PORT/"
Write-Host "Press Ctrl+C in this window to stop the service."
& $node scripts\tobytube-server.mjs
