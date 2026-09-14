[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$desktopPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'apps\desktop\package.json') -Raw | ConvertFrom-Json
$installer = Join-Path $projectRoot "artifacts\windows\Trivergence-$($desktopPackage.version)-windows-x64-UNSIGNED.exe"
$asar = Join-Path $projectRoot 'artifacts\windows\win-unpacked\resources\app.asar'
$env:CI = 'true'
$env:SOURCE_DATE_EPOCH = '1789084800'

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}

function Build-And-Digest {
  Push-Location $projectRoot
  try {
    & pnpm --filter '@trivergence/desktop' package:win
    if ($LASTEXITCODE -ne 0) { throw "Windows package build failed: $LASTEXITCODE" }
  }
  finally { Pop-Location }
  if (-not (Test-Path -LiteralPath $installer) -or -not (Test-Path -LiteralPath $asar)) { throw 'Expected package artifacts are missing' }
  return [ordered]@{
    Installer = Get-Sha256 $installer
    AppAsar = Get-Sha256 $asar
  }
}

$first = Build-And-Digest
$second = Build-And-Digest
$differences = @()
if ($first.Installer -ne $second.Installer) { $differences += "Installer: $($first.Installer) != $($second.Installer)" }
if ($first.AppAsar -ne $second.AppAsar) { $differences += "app.asar: $($first.AppAsar) != $($second.AppAsar)" }
if ($differences.Count -gt 0) {
  Write-Output ([pscustomobject]@{ Status = 'FAIL'; FirstInstaller = $first.Installer; SecondInstaller = $second.Installer; FirstAppAsar = $first.AppAsar; SecondAppAsar = $second.AppAsar })
  throw ($differences -join '; ')
}
[pscustomobject]@{ Status = 'PASS'; InstallerSha256 = $second.Installer; AppAsarSha256 = $second.AppAsar }
