<#
  Stops the Lifegrid task API and UI that start.ps1 launched. Safe to run when nothing is running.
  Data is never touched: the database and backups stay in <repo>\data.

  A tracked PID is only terminated when the process still matches what start.ps1 launched
  (executable and command line under this repository). A reused or stale PID is skipped,
  never killed.
#>
$ErrorActionPreference = 'Continue'
$root = (Split-Path $PSScriptRoot -Parent)
$pidFile = Join-Path $root 'data\run\pids.json'

function Test-Ours([System.Management.Automation.PSObject]$proc) {
  # A process counts as ours when its executable sits under the repository (or is the .NET CLI),
  # and its command line references this repository.
  if (-not $proc) { return $false }
  $name = ($proc.Name -replace '\.exe$', '')
  $nameOk = $name -in 'dotnet', 'node', 'TaskFlow.Api'
  $cmd = "$($proc.CommandLine)"
  $exe = "$($proc.ExecutablePath)"
  $whereOk = $cmd -match [regex]::Escape($root) -or $exe -match [regex]::Escape($root)
  $roleOk = $nameOk -and ($cmd -match 'TaskFlow\.Api' -or $cmd -match 'vite' -or $exe -match 'TaskFlow\.Api')
  $nameOk -and ($whereOk -or $roleOk)
}

function Stop-Tree([int]$id) {
  if ($id -le 0) { return }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  if (-not (Test-Ours $proc)) {
    if ($proc) { Write-Warning "PID $id no longer matches our processes (now: $($proc.Name) - $($proc.CommandLine)). Skipped; nothing killed." }
    else { Write-Host "PID $id is not running (stale entry); nothing to stop." }
    return
  }
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Tree $_.ProcessId }
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

if (Test-Path $pidFile) {
  $p = Get-Content $pidFile -Raw | ConvertFrom-Json
  Stop-Tree $p.api
  Stop-Tree $p.web
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Anything still holding the ports that is clearly ours. Both checks require this repo's path/binaries,
# so a same-named process from another project is never terminated.
Get-Process TaskFlow.Api -ErrorAction SilentlyContinue |
  Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").ExecutablePath -match [regex]::Escape($root) } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'vite' -and $_.CommandLine -match [regex]::Escape($root) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep 1
$left = Get-NetTCPConnection -LocalPort 5062, 5174 -State Listen -ErrorAction SilentlyContinue
if ($left) { Write-Warning "Ports still in use: $($left.LocalPort -join ', ')" } else { Write-Host 'Lifegrid stopped.' }
