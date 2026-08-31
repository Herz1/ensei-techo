param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$handoffRoot = Join-Path $projectRoot "handoff"
if (-not $OutputPath) {
  $stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
  $OutputPath = Join-Path $handoffRoot "ensei-techo-pro-handoff-$stamp.zip"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $projectRoot $OutputPath
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $resolvedOutput) {
  throw "Output already exists: $resolvedOutput"
}

$stageRoot = Join-Path ([IO.Path]::GetTempPath()) ("ensei-techo-pro-handoff-" + [guid]::NewGuid().ToString("N"))
$packageRoot = Join-Path $stageRoot "ensei-techo"

function Copy-RelativePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $source = Join-Path $projectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required handoff file is missing: $RelativePath"
  }

  $destination = Join-Path $packageRoot $RelativePath
  $item = Get-Item -LiteralPath $source
  if ($item.PSIsContainer) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
  } else {
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

$includedPaths = @(
  ".gitignore",
  "README.md",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "启动远征手账.cmd",
  "关闭远征手账.cmd",
  "handoff\PRO_MODEL_HANDOFF.md",
  "handoff\NEXT_GOALS_8A_8B_9.md",
  "handoff\PACKAGE_MANIFEST.md",
  "handoff\BUILD_PRO_HANDOFF.ps1",
  "src\app",
  "src\components",
  "src\lib",
  "scripts",
  "public",
  "src\data\index.ts",
  "src\data\prefectures.ts",
  "src\data\artists.json",
  "src\data\artists-ingested.json",
  "src\data\venues.json",
  "src\data\venues-ingested.json",
  "src\data\events.json",
  "src\data\ingest\report.json",
  "src\data\ingest\completeness-report.json",
  "src\data\ingest\completeness-report.md",
  "src\data\ingest\source-audit-report.json",
  "src\data\ingest\source-audit-report.md",
  "src\data\ingest\link-frontier.json",
  "src\data\ingest\ticket-frontier-raw-manifest.json",
  "src\data\ingest\ticket-offer-observations.json",
  "src\data\ingest\ticket-coverage-baseline.json",
  "src\data\ingest\ticket-coverage-goal6-before.json",
  "src\data\ingest\ticket-coverage-goal6-after.json",
  "src\data\ingest\ticket-coverage-current.json",
  "src\data\ingest\ticket-coverage-current.md",
  "src\data\ingest\ticket-coverage-goal6-1-audit.md"
)

try {
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  foreach ($relativePath in $includedPaths) {
    Copy-RelativePath -RelativePath $relativePath
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutput) -Force | Out-Null
  Compress-Archive -Path $packageRoot -DestinationPath $resolvedOutput -CompressionLevel Optimal
  $archive = Get-Item -LiteralPath $resolvedOutput
  $hash = Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256
  $hashPath = "$resolvedOutput.sha256"
  "$($hash.Hash.ToLowerInvariant())  $($archive.Name)" | Set-Content -LiteralPath $hashPath -Encoding utf8NoBOM
  Write-Host "Created: $($archive.FullName)" -ForegroundColor Green
  Write-Host "Size: $([math]::Round($archive.Length / 1MB, 2)) MB"
  Write-Host "SHA256: $($hash.Hash.ToLowerInvariant())"
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
