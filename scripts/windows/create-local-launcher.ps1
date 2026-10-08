param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$launcherPath = Join-Path $ProjectRoot 'MarkHere.exe'
$packagedExe = Join-Path $ProjectRoot 'dist\win-unpacked\markhere.exe'

if (-not (Test-Path -LiteralPath $packagedExe)) {
  throw "Packaged MarkHere executable is missing: $packagedExe. Run Setup-MarkHere.cmd first."
}

if (Test-Path -LiteralPath $launcherPath) {
  try { Remove-Item -LiteralPath $launcherPath -Force }
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

Add-Type `
  -TypeDefinition $source `
  -Language CSharp `
  -OutputAssembly $launcherPath `
  -OutputType WindowsApplication `
  -ReferencedAssemblies @('System.dll', 'System.Windows.Forms.dll')

if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "Launcher compilation did not create $launcherPath"
}

Write-Host "Created $launcherPath -> $packagedExe"
