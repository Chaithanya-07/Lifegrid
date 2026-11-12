<#
  Starts TaskFlow (API on http://localhost:5062, UI on http://localhost:5174).

    .\scripts\start.ps1             # development servers (Vite dev + API)
    .\scripts\start.ps1 -Preview    # serve the production build (builds it first)

  Data lives in <repo>\data (database, backups, attachments, logs). Stop with .\scripts\stop.ps1
#>
param([switch]$Preview, [switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root 'data'
$logs = Join-Path $data 'logs'
$run = Join-Path $data 'run'
New-Item -ItemType Directory -Force $logs, $run | Out-Null

foreach ($port in 5062, 5174) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use. Run .\scripts\stop.ps1 first (or check what is using it)."
  }
}

# Safety copy of the database, once per day, so an upgrade can always be undone.
$db = Join-Path $data 'taskflow.db'
if (Test-Path $db) {
  $backups = Join-Path $data 'backups'
  New-Item -ItemType Directory -Force $backups | Out-Null
  $today = Get-ChildItem $backups -Directory -Filter "startup-$(Get-Date -Format 'yyyyMMdd')-*" -ErrorAction SilentlyContinue
  if (-not $today) {
    $bk = Join-Path $backups "startup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    New-Item -ItemType Directory -Force $bk | Out-Null
    foreach ($f in 'taskflow.db', 'taskflow.db-wal', 'taskflow.db-shm') {
      if (Test-Path (Join-Path $data $f)) { Copy-Item (Join-Path $data $f) $bk }
    }
    Write-Host "Database copied to $bk"
  }
}

Write-Host 'Building API...'
dotnet build "$root\api\TaskFlow.Api" --nologo -v q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }

if ($Preview) {
  Write-Host 'Building UI...'
  Push-Location "$root\web"
  npm run build 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'UI build failed.' }
  Pop-Location
}

# Start both servers hidden. Development data paths are configured as ABSOLUTE paths in
# api/TaskFlow.Api/appsettings.Development.json, pointing at <repo>\data — they hold regardless of the
# working directory dotnet run gives the app (it launches with the project folder as its CWD).
# Production keeps its own relative configuration in appsettings.json.
$api = Start-Process dotnet -ArgumentList 'run', '--no-build', '--launch-profile', 'http', '--project', "$root\api\TaskFlow.Api" `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput "$logs\api.out.log" -RedirectStandardError "$logs\api.err.log"
$webArgs = if ($Preview) { "$root\web\node_modules\vite\bin\vite.js", 'preview' } else { "$root\web\node_modules\vite\bin\vite.js" }
$web = Start-Process node -ArgumentList $webArgs -WorkingDirectory "$root\web" `
  -PassThru -WindowStyle Hidden -RedirectStandardOutput "$logs\web.out.log" -RedirectStandardError "$logs\web.err.log"
@{ api = $api.Id; web = $web.Id; started = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content "$run\pids.json"

# Readiness probe: /api/health is AllowAnonymous (liveness). /api/about requires authentication, so it
# 401s from a fresh process and can never be used as an unauthenticated readiness check.
$up = $false
for ($i = 0; $i -lt 60; $i++) {
  try { $h = Invoke-RestMethod http://localhost:5062/api/health -TimeoutSec 2; if ($h.status -eq 'ok') { $up = $true; break } } catch { Start-Sleep 1 }
}
if (-not $up) { throw "TaskFlow did not start. See $logs\api.err.log and $logs\web.err.log" }

Write-Host ''
Write-Host 'TaskFlow is running:  http://localhost:5174' -ForegroundColor Green
Write-Host "Database: $db"
Write-Host 'Stop with:  .\scripts\stop.ps1'
if (-not $NoOpen) { Start-Process 'http://localhost:5174' }
