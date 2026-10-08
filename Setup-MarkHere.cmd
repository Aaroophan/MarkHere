@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "MARKHERE_SETUP_FILE=%~f0"
set "MARKHERE_SETUP_ROOT=%CD%"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell is required but was not found.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $raw=[IO.File]::ReadAllText($env:MARKHERE_SETUP_FILE); $marker='::MARKHERE_'+'POWERSHELL_BEGIN'; $pos=$raw.IndexOf($marker,[StringComparison]::Ordinal); if($pos -lt 0){throw 'Embedded setup payload missing.'}; $body=$raw.Substring($pos+$marker.Length); & ([ScriptBlock]::Create($body)) -ProjectRoot $env:MARKHERE_SETUP_ROOT"
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo Setup did not complete. Review the error above.
  echo.
  pause
  exit /b %RC%
)

exit /b 0

::MARKHERE_POWERSHELL_BEGIN
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$NodeVersion = '22.16.0'
$PnpmVersion = '10.33.4'
$NodeArchive = "node-v$NodeVersion-win-x64"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$ToolsRoot = Join-Path $ProjectRoot '.markhere-tools'
$CacheRoot = Join-Path $ToolsRoot 'cache'
$NodeHome = Join-Path $ToolsRoot $NodeArchive
$NodeZip = Join-Path $CacheRoot "$NodeArchive.zip"
$NodeShasums = Join-Path $CacheRoot 'SHASUMS256.txt'
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchive.zip"
$NodeShasumsUrl = "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt"
$NodeExe = Join-Path $NodeHome 'node.exe'
$Corepack = Join-Path $NodeHome 'corepack.cmd'
$Pnpm = Join-Path $NodeHome 'pnpm.cmd'
$Lockfile = Join-Path $ProjectRoot 'pnpm-lock.yaml'
$DesktopOut = Join-Path $ProjectRoot 'apps\desktop\out'
$LauncherPath = Join-Path $ProjectRoot 'MarkHere.exe'

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)"
    }
}

function Write-Section([string]$Text) {
    Write-Host $Text -ForegroundColor Cyan
}

function New-MarkHereLauncher {
    $packagedExe = Join-Path $ProjectRoot 'dist\win-unpacked\markhere.exe'
    if (-not (Test-Path -LiteralPath $packagedExe)) {
        throw "Packaged MarkHere executable is missing: $packagedExe"
    }

    if (Test-Path -LiteralPath $LauncherPath) {
        try { Remove-Item -LiteralPath $LauncherPath -Force }
        catch { throw 'Could not replace MarkHere.exe. Close MarkHere if it is running, then run setup again.' }
    }

    $source = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class MarkHereLauncher
{
    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string packagedExe = Path.Combine(root, "dist", "win-unpacked", "markhere.exe");

            if (!File.Exists(packagedExe))
            {
                Fail("The packaged MarkHere application is missing. Run Setup-MarkHere.cmd again.");
                return;
            }

            var commandLine = new StringBuilder();
            foreach (string arg in args)
            {
                if (commandLine.Length > 0) commandLine.Append(' ');
                commandLine.Append(Quote(arg));
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = packagedExe,
                Arguments = commandLine.ToString(),
                WorkingDirectory = Path.GetDirectoryName(packagedExe),
                UseShellExecute = false,
                CreateNoWindow = true
            };

            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            Fail("MarkHere could not be started.\n\n" + ex.Message);
        }
    }

    private static void Fail(string message)
    {
        MessageBox.Show(message, "MarkHere", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private static string Quote(string value)
    {
        if (value.Length == 0) return "\"\"";
        if (value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '\"' }) < 0) return value;

        var result = new StringBuilder();
        result.Append('\"');
        int backslashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { backslashes++; continue; }
            if (c == '\"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('\"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(c);
        }
        result.Append('\\', backslashes * 2);
        result.Append('\"');
        return result.ToString();
    }
}
'@

    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $LauncherPath -OutputType WindowsApplication -ReferencedAssemblies @('System.dll', 'System.Windows.Forms.dll')
    if (-not (Test-Path -LiteralPath $LauncherPath)) { throw 'Launcher compilation did not create MarkHere.exe.' }
}

try {
    Clear-Host
    Write-Host '============================================================'
    Write-Host ' MarkHere one-click local setup'
    Write-Host '============================================================'
    Write-Host ''
    Write-Host 'Everything is installed inside this project folder.'
    Write-Host 'Administrator rights and system PATH changes are not required.'
    Write-Host ''

    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "MarkHere's current validated Windows target is x64."
    }

    New-Item -ItemType Directory -Force -Path $ToolsRoot, $CacheRoot | Out-Null

    if (-not (Test-Path -LiteralPath $NodeExe)) {
        Write-Section "[1/6] Downloading portable Node.js v$NodeVersion..."
        Invoke-WebRequest -UseBasicParsing -Uri $NodeUrl -OutFile $NodeZip
        Invoke-WebRequest -UseBasicParsing -Uri $NodeShasumsUrl -OutFile $NodeShasums

        Write-Host '      Verifying Node.js SHA-256...'
        $expected = $null
        $wantedName = "$NodeArchive.zip"
        foreach ($candidate in [IO.File]::ReadLines($NodeShasums)) {
            $parts = $candidate -split '\s+'
            if ($parts.Length -ge 2 -and $parts[$parts.Length - 1].TrimStart('*') -eq $wantedName) {
                $expected = $parts[0].ToLowerInvariant()
                break
            }
        }
        if (-not $expected) { throw "Checksum entry for $wantedName was not found." }
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $NodeZip).Hash.ToLowerInvariant()
        if ($actual -ne $expected) {
            Remove-Item -LiteralPath $NodeZip -Force -ErrorAction SilentlyContinue
            throw "Node.js checksum verification failed. Expected $expected, got $actual."
        }

        Write-Host '      Extracting portable Node.js...'
        if (Test-Path -LiteralPath $NodeHome) { Remove-Item -LiteralPath $NodeHome -Recurse -Force }
        Expand-Archive -LiteralPath $NodeZip -DestinationPath $ToolsRoot -Force
    }
    else {
        Write-Section "[1/6] Portable Node.js v$NodeVersion already present."
    }

    if (-not (Test-Path -LiteralPath $NodeExe)) { throw "Node.js was not installed at $NodeExe" }
    $nodeVersionOutput = (& $NodeExe --version).Trim()
    if ($nodeVersionOutput -ne "v$NodeVersion") { throw "Expected Node.js v$NodeVersion, found $nodeVersionOutput." }

    $env:PATH = "$NodeHome;$env:PATH"

    Write-Section "[2/6] Preparing pnpm $PnpmVersion with Corepack..."
    if (-not (Test-Path -LiteralPath $Corepack)) { throw "Corepack was not found at $Corepack" }
    Invoke-NativeChecked -FilePath $Corepack -Arguments @('enable') -FailureMessage 'Corepack enable failed.'
    Invoke-NativeChecked -FilePath $Corepack -Arguments @('prepare', "pnpm@$PnpmVersion", '--activate') -FailureMessage 'Corepack could not activate pnpm.'
    if (-not (Test-Path -LiteralPath $Pnpm)) { throw 'Corepack did not create pnpm.cmd.' }
    $pnpmVersionOutput = (& $Pnpm --version).Trim()
    if ($pnpmVersionOutput -ne $PnpmVersion) { throw "Expected pnpm $PnpmVersion, found $pnpmVersionOutput." }

    if (-not (Test-Path -LiteralPath $Lockfile)) {
        throw 'pnpm-lock.yaml is missing. Use the latest complete MarkHere project before running setup.'
    }

    Write-Section '[3/6] Installing locked MarkHere dependencies...'
    Push-Location $ProjectRoot
    try {
        Invoke-NativeChecked -FilePath $Pnpm -Arguments @('install', '--frozen-lockfile') -FailureMessage 'Dependency installation failed.'

        Write-Section '[4/6] Installing the Electron runtime...'
        Invoke-NativeChecked -FilePath $Pnpm -Arguments @('--filter', '@markhere/desktop', 'exec', 'install-electron', '--no') -FailureMessage 'Electron runtime installation failed.'
        Invoke-NativeChecked -FilePath $Pnpm -Arguments @('--filter', '@markhere/desktop', 'exec', 'electron', '--version') -FailureMessage 'Electron was downloaded but cannot be executed.'

        Write-Section '[5/6] Building the real packaged MarkHere application...'
        if (Test-Path -LiteralPath $DesktopOut) { Remove-Item -LiteralPath $DesktopOut -Recurse -Force }
        $packagedRoot = Join-Path $ProjectRoot 'dist\win-unpacked'
        if (Test-Path -LiteralPath $packagedRoot) {
            try { Remove-Item -LiteralPath $packagedRoot -Recurse -Force }
            catch { throw 'Could not replace dist\win-unpacked. Close MarkHere if it is running, then run setup again.' }
        }
        Invoke-NativeChecked -FilePath $Pnpm -Arguments @('package:win:dir') -FailureMessage 'MarkHere Windows packaging failed.'
        $packagedExe = Join-Path $ProjectRoot 'dist\win-unpacked\markhere.exe'
        if (-not (Test-Path -LiteralPath $packagedExe)) { throw "Packaging completed without creating $packagedExe" }
    }
    finally {
        Pop-Location
    }

    Write-Section '[6/6] Creating the root MarkHere.exe launcher...'
    New-MarkHereLauncher

    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' MarkHere setup completed successfully.' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host 'From now on, double-click:'
    Write-Host "  $LauncherPath" -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'MarkHere.exe now launches the real packaged app under dist\win-unpacked.'
    Write-Host 'Rerun Setup-MarkHere.cmd after source/dependency changes that require a rebuild.'
    Write-Host ''

    Start-Process -FilePath $LauncherPath -WorkingDirectory $ProjectRoot
    exit 0
}
catch {
    Write-Host ''
    Write-Host '[ERROR] MarkHere setup failed:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    exit 1
}
