param([int]$Port = 8092)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot

$portInUse = $false
$client = [System.Net.Sockets.TcpClient]::new()
try {
  $connect = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
  $portInUse = $connect.AsyncWaitHandle.WaitOne(500) -and $client.Connected
} catch {} finally {
  $client.Dispose()
}

if ($portInUse) {
  throw "Tobytube is already running on port $Port. Close the existing Tobytube PowerShell/VS Code server window first, then run this command again."
}

$env:PORT = [string]$Port
$env:TOBYTUBE_LAN_BETA = 'true'
$env:SCAN_ON_STARTUP = 'false'
Write-Output "Starting Tobytube Android LAN beta on port $Port. Stop with Ctrl+C."
Write-Output "Only use this unencrypted listener on a trusted private LAN."
Write-Output "Leave this PowerShell window open while testing the Android app."
Push-Location $project
try { & node '.\scripts\tobytube-server.mjs' } finally { Pop-Location }
