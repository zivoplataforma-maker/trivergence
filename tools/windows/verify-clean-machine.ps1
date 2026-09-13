[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [string]$ExpectedPublisher,
  [switch]$AllowUnsigned
)

$ErrorActionPreference = 'Stop'
$resolvedInstaller = (Resolve-Path -LiteralPath $Installer).Path
$actualHash = (Get-FileHash -LiteralPath $resolvedInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Installer SHA-256 mismatch' }
$signature = Get-AuthenticodeSignature -LiteralPath $resolvedInstaller
if (-not $AllowUnsigned) {
  if ($signature.Status -ne 'Valid') { throw "Installer signature is not valid: $($signature.Status)" }
  if ($ExpectedPublisher -and $signature.SignerCertificate.Subject -notlike "*$ExpectedPublisher*") { throw 'Unexpected installer publisher' }
}

$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\Trivergence'
if (Test-Path -LiteralPath $installRoot) { throw 'A Trivergence installation already exists; use a clean machine' }
try {
  $installerProcess = Start-Process -FilePath $resolvedInstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($installerProcess.ExitCode -ne 0) { throw "Silent installation failed: $($installerProcess.ExitCode)" }
  $application = Join-Path $installRoot 'Trivergence.exe'
  $uninstaller = Join-Path $installRoot 'Uninstall Trivergence.exe'
  if (-not (Test-Path -LiteralPath $application) -or -not (Test-Path -LiteralPath $uninstaller)) { throw 'Installed application is incomplete' }
  $smoke = Start-Process -FilePath $application -ArgumentList '--distribution-smoke-test' -WindowStyle Hidden -Wait -PassThru
  if ($smoke.ExitCode -ne 0) { throw "Packaged smoke test failed: $($smoke.ExitCode)" }
  $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Silent uninstall failed: $($uninstall.ExitCode)" }
  for ($attempt = 0; $attempt -lt 30 -and (Test-Path -LiteralPath $application); $attempt++) {
    Start-Sleep -Milliseconds 500
  }
  if (Test-Path -LiteralPath $application) { throw 'Uninstall left the application executable behind' }
  [pscustomobject]@{ Status = 'PASS'; InstallerSha256 = $actualHash; Signature = $signature.Status.ToString(); InstallRunUninstall = 'PASS' }
}
finally {
  if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
}
