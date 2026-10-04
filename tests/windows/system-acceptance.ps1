param([Parameter(Mandatory=$true)][string]$Installer, [string]$Fixture = "packages/test-fixtures/fixtures/unicode/multiscript.md")
$ErrorActionPreference = "Stop"
$installerPath=(Resolve-Path $Installer).Path
$sig=Get-AuthenticodeSignature $installerPath
if($sig.Status -ne 'Valid'){ throw "Installer signature is not valid: $($sig.Status)" }
$beforeUserChoice=@{}
Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts -ErrorAction SilentlyContinue | ForEach-Object { try { $beforeUserChoice[$_.PSChildName]=(Get-ItemProperty "$($_.PSPath)\UserChoice" -ErrorAction Stop).ProgId } catch {} }
$proc=Start-Process -FilePath $installerPath -ArgumentList '/S' -PassThru -Wait
if($proc.ExitCode -ne 0){ throw "Silent install failed: $($proc.ExitCode)" }
$appPath=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\markhere.exe').'(default)'
if(-not (Test-Path $appPath)){ throw 'Installed markhere.exe not found' }
$registered=(Get-ItemProperty 'HKCU:\Software\RegisteredApplications').MarkHere
if(-not $registered){ throw 'MarkHere RegisteredApplications capability missing' }
foreach($ext in '.md','.markdown','.mmd','.mdown','.mdtext','.mdtxt'){
  $value=(Get-ItemProperty "HKCU:\Software\Classes\$ext\OpenWithProgids" -ErrorAction Stop).'MarkHere.MarkdownDocument'
  if($null -eq $value){ throw "Missing OpenWith ProgID for $ext" }
}
foreach($key in $beforeUserChoice.Keys){ try { $after=(Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$key\UserChoice" -ErrorAction Stop).ProgId; if($after -ne $beforeUserChoice[$key]){ throw "Installer changed protected UserChoice for $key" } } catch [System.Management.Automation.ItemNotFoundException] {} }
$fixturePath=(Resolve-Path $Fixture).Path
$app=Start-Process -FilePath $appPath -ArgumentList @($fixturePath) -PassThru
Start-Sleep -Seconds 3
if($app.HasExited){ throw 'Installed application exited during launch smoke test' }
Stop-Process -Id $app.Id -Force
$uninstall=Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like 'MarkHere*' } | Select-Object -First 1
if(-not $uninstall){ throw 'MarkHere uninstall registration missing' }
$uninstaller=($uninstall.UninstallString -replace '^"|"$','')
$u=Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
if($u.ExitCode -ne 0){ throw "Uninstall failed: $($u.ExitCode)" }
if(-not (Test-Path $fixturePath)){ throw 'Uninstall deleted user Markdown fixture' }
Write-Host 'Windows installer/file-handler/uninstall acceptance OK'
