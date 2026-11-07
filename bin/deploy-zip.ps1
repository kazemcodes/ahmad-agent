<#Requires -Version 5.1
<#
.SYNOPSIS
  Creates a clean deploy zip for the آقای ناظر Bale bot.

.DESCRIPTION
  Stages only deploy-relevant files into a temp dir and zips them.
  Excluded: .env (secrets!), data/, .git, .claude, .aider*, *.sqlite,
  *.log, *.zip, old-example, tests (unless -IncludeTests).

.PARAMETER Output
  Output zip path. Defaults to .\ahmad-agent-deploy.zip next to the project root.

.PARAMETER IncludeTests
  Optionally include tests\ in the zip.

.PARAMETER IncludeDocs
  Include docs\ (default $true).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\bin\deploy-zip.ps1
  powershell -ExecutionPolicy Bypass -File .\bin\deploy-zip.ps1 -Output .\deploy.zip

.NOTES
  After extracting on the server:
    Copy-Item .env.example .env   # then fill in BALE_TOKEN etc.
    php bin/poll.php
    php bin/image-worker.php
    php bin/image-worker.php 2
#>
[CmdletBinding()]
param(
  [string]$Output = "",
  [switch]$IncludeTests,
  [bool]$IncludeDocs = $true
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Output)) {
  $Output = Join-Path $ProjectRoot "ahmad-agent-deploy.zip"
}
$Output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)

# Files/dirs to ship (relative to project root)
$Allow = @("src", "bin", "public", "dashboard", "config.php", ".env.example", "README.md", "DEPLOY.md", "Start Ahmad.bat")
if ($IncludeDocs) { $Allow += "docs" }
if ($IncludeTests) { $Allow += "tests" }

# Hard excludes even if accidentally in the allow list
$ExcludeNames = @(".env", ".git", ".claude", ".aider-desk", ".aider.chat.history.md", ".aider.input.history", ".aider.tags.cache.v4", "data", "ahmad-agent.zip", "ahmad-agent-deploy.zip", "old-example")
$ExcludeExtensions = @(".sqlite", ".db", ".log", ".zip")

$Stage = Join-Path ([IO.Path]::GetTempPath()) ("ahmad-deploy-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $Stage | Out-Null

try {
  # Lint PHP files in the allow list (if php is available)
  $phpCmd = Get-Command php -ErrorAction SilentlyContinue
  if ($phpCmd) {
    Get-ChildItem -Path (Join-Path $ProjectRoot "src") -Filter *.php -File -Recurse | ForEach-Object {
      & php -l $_.FullName | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "PHP lint failed: $($_.FullName)" }
    }
    Write-Host "PHP lint passed (src)."
  } else {
    Write-Warning "php not found on PATH - skipping lint."
  }

  foreach ($item in $Allow) {
    $src = Join-Path $ProjectRoot $item
    if (!(Test-Path $src)) { Write-Warning "Skipping missing item: $item"; continue }
    if ($item -in $ExcludeNames) { continue }

    if (Test-Path $src -PathType Leaf) {
      if ($ExcludeExtensions -contains [IO.Path]::GetExtension($item)) { continue }
      Copy-Item -Path $src -Destination (Join-Path $Stage $item) -Force
    } else {
      # Copy directory, pruning excluded entries
      $destDir = Join-Path $Stage $item
      New-Item -ItemType Directory -Path $destDir -Force | Out-Null
      Get-ChildItem -Path $src -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring($ProjectRoot.Length).TrimStart('\','/')
        $parts = $rel -split '[\\/]'
        if ($parts | Where-Object { $_ -in $ExcludeNames }) { return }
        if ($ExcludeExtensions -contains $_.Extension -and !$_.PSIsContainer) { return }
        if ($_.Name -in $ExcludeNames) { return }
        $target = Join-Path $Stage $rel
        if ($_.PSIsContainer) {
          if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
        } else {
          $parent = Split-Path -Parent $target
          if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
          Copy-Item -Path $_.FullName -Destination $target -Force
        }
      }
    }
  }

  # Never ship a real .env - double-check
  $envFile = Join-Path $Stage ".env"
  if (Test-Path $envFile) { Remove-Item $envFile -Force; Write-Warning "Removed a stray .env from the stage (should never be in deploy zip)." }
  $dataDir = Join-Path $Stage "data"
  if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }

  # Zip it (Compress-Archive is built-in on Windows PS 5.1+)
  if (Test-Path $Output) { Remove-Item $Output -Force }
  $zipItems = Get-ChildItem -Path $Stage -Force
  if (-not $zipItems) { throw "Stage is empty - nothing to zip." }
  Compress-Archive -Path ($zipItems | ForEach-Object { $_.FullName }) -DestinationPath $Output -Force

  $size = (Get-Item $Output).Length
  Write-Host ""
  Write-Host "Created deploy zip:"
  Write-Host "  $Output"
  Write-Host ("  {0:N2} KB" -f ($size/1KB))
  Write-Host ""
  Write-Host "On the server:"
  Write-Host "  Expand-Archive '$Output' -DestinationPath . -Force"
  Write-Host "  Copy-Item .env.example .env   # fill BALE_TOKEN, ADMIN_IDS, AI_*, IMAGE_*"
  Write-Host "  php bin/poll.php"
  Write-Host "  php bin/image-worker.php"
  Write-Host "  php bin/image-worker.php 2"

  # List contents
  Write-Host ""
  Write-Host "Contents:"
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  [IO.Compression.ZipFile]::OpenRead($Output).Entries | ForEach-Object { Write-Host ("  " + $_.FullName) }
}
finally {
  if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue }
}
