param([string]$UserId = 'owner', [int]$Port = 8092)
$ErrorActionPreference = 'Stop'
$baseUrl = "http://127.0.0.1:$Port"

try {
  $server = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/v1" -TimeoutSec 5
} catch {
  throw "The Android-enabled Tobytube server is not running. First run .\scripts\start-android-lan-beta.ps1 and leave that PowerShell window open."
}

if (-not $server.ok -or -not $server.data.server.fingerprint) {
  throw "The Tobytube currently running on port $Port is not the Android-enabled version. Stop the old Tobytube server, then run .\scripts\start-android-lan-beta.ps1 and leave that window open."
}

$body = @{ userId = $UserId } | ConvertTo-Json
try {
  $result = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/v1/admin/pairing-codes" -ContentType 'application/json' -Body $body
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 404) {
    throw "The Tobytube currently running on port $Port is an older copy without Android pairing. Stop it, run .\scripts\start-android-lan-beta.ps1, leave that window open, and then try this command again."
  }
  throw
}
if (-not $result.ok) { throw 'Tobytube did not create a pairing code.' }
Write-Output "Connected to: $($server.data.server.displayName)"
Write-Output "Server fingerprint: $($server.data.server.fingerprint)"
Write-Output "Pairing code for $UserId`: $($result.data.code)"
Write-Output "Expires: $($result.data.pairing.expiresAt)"
