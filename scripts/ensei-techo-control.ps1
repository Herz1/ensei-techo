param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop")]
  [string]$Action,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 3720
$url = "http://127.0.0.1:$port/"
$stateFile = Join-Path $projectRoot ".ensei-techo\server.json"

function Get-ListeningProcessIds {
  $pattern = "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  return @(
    & netstat -ano -p tcp |
      ForEach-Object {
        if ($_ -match $pattern) {
          [int]$Matches[1]
        }
      } |
      Sort-Object -Unique
  )
}

function Remove-StateFile {
  if (Test-Path -LiteralPath $stateFile) {
    Remove-Item -LiteralPath $stateFile -Force
  }
}

function Get-OwnedServerProcess {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    return $null
  }

  try {
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  } catch {
    Remove-StateFile
    return $null
  }

  if (-not $process) {
    Remove-StateFile
    return $null
  }

  $expectedNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  $recordedStart = [DateTimeOffset]::Parse($state.startedAt).LocalDateTime
  $startDeltaSeconds = [Math]::Abs(($process.StartTime - $recordedStart).TotalSeconds)
  $isOwned =
    $state.projectRoot -eq $projectRoot -and
    [int]$state.port -eq $port -and
    $process.ProcessName -eq "node" -and
    $process.Path -eq $expectedNode -and
    $startDeltaSeconds -lt 30

  if (-not $isOwned) {
    Remove-StateFile
    return $null
  }

  return $process
}

function Invoke-Npm {
  param([string[]]$Arguments)

  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  & $npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Test-BuildRequired {
  $buildId = Join-Path $projectRoot ".next\BUILD_ID"
  if (-not (Test-Path -LiteralPath $buildId)) {
    return $true
  }

  $buildTime = (Get-Item -LiteralPath $buildId).LastWriteTimeUtc
  $rootFiles = @(
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs"
  ) | ForEach-Object { Join-Path $projectRoot $_ }

  $sourceFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot "src") -Recurse -File
    Get-ChildItem -LiteralPath (Join-Path $projectRoot "public") -Recurse -File
    Get-Item -LiteralPath $rootFiles -ErrorAction SilentlyContinue
  )

  return [bool]($sourceFiles | Where-Object { $_.LastWriteTimeUtc -gt $buildTime } | Select-Object -First 1)
}

function Start-EnseiTecho {
  $ownedProcess = Get-OwnedServerProcess
  if ($ownedProcess) {
    Write-Host "Ensei Techo is already running (PID $($ownedProcess.Id))." -ForegroundColor Green
    if (-not $NoBrowser) {
      Start-Process $url
    }
    return
  }

  $listeners = Get-ListeningProcessIds
  if ($listeners.Count -gt 0) {
    throw "Port $port is used by another process (PID: $($listeners -join ', ')). Nothing was started or stopped."
  }

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js 20 or later first."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Host "First run: installing dependencies..." -ForegroundColor Cyan
    Invoke-Npm @("install")
  }

  if (Test-BuildRequired) {
    Write-Host "Source changes detected: creating a production build..." -ForegroundColor Cyan
    Invoke-Npm @("run", "build")
  }

  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $server = Start-Process `
    -FilePath $node `
    -ArgumentList @(".\node_modules\next\dist\bin\next", "start", "-p", "$port") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru

  New-Item -ItemType Directory -Path (Split-Path -Parent $stateFile) -Force | Out-Null
  @{
    pid = $server.Id
    port = $port
    projectRoot = $projectRoot
    startedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($server.HasExited) {
      Remove-StateFile
      throw "The server failed to start (exit code $($server.ExitCode))."
    }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # The server is still starting.
    }
  }

  if (-not $ready) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    Remove-StateFile
    throw "The server was not ready within 20 seconds and was stopped safely."
  }

  Write-Host "Ensei Techo started: $url (PID $($server.Id))" -ForegroundColor Green
  if (-not $NoBrowser) {
    Start-Process $url
  }
}

function Stop-EnseiTecho {
  $ownedProcess = Get-OwnedServerProcess
  if (-not $ownedProcess) {
    $listeners = Get-ListeningProcessIds
    if ($listeners.Count -gt 0) {
      throw "Port $port is used by another process (PID: $($listeners -join ', ')). It was not stopped."
    }
    Write-Host "Ensei Techo is not running." -ForegroundColor Yellow
    return
  }

  Stop-Process -Id $ownedProcess.Id -Force
  $ownedProcess.WaitForExit(5000) | Out-Null
  Remove-StateFile
  Write-Host "Ensei Techo server stopped." -ForegroundColor Green
}

Set-Location -LiteralPath $projectRoot
if ($Action -eq "start") {
  Start-EnseiTecho
} else {
  Stop-EnseiTecho
}
