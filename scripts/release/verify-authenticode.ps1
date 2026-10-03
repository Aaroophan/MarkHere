param([string]$Path = "dist")
$ErrorActionPreference = "Stop"
$files = Get-ChildItem -Path $Path -Recurse -File | Where-Object { $_.Extension -eq ".exe" }
if (-not $files) { throw "No Windows executables found under $Path" }
$failed = @()
foreach ($file in $files) {
  $sig = Get-AuthenticodeSignature $file.FullName
  Write-Host "$($file.Name): $($sig.Status) $($sig.SignerCertificate.Subject)"
  if ($sig.Status -ne "Valid") { $failed += $file.FullName }
}
if ($failed.Count -gt 0) { throw "Invalid or missing Authenticode signature: $($failed -join ', ')" }
