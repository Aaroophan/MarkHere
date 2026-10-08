param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$launcherPath = Join-Path $ProjectRoot 'MarkHere.exe'

if (Test-Path $launcherPath) {
  Remove-Item -Force $launcherPath
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
            string appDir = Path.Combine(root, "apps", "desktop");
            string mainEntry = Path.Combine(appDir, "out", "main", "index.js");
            string electronExe = Path.Combine(appDir, "node_modules", "electron", "dist", "electron.exe");

            if (!File.Exists(mainEntry))
            {
                Fail("MarkHere has not been built yet. Run Setup-MarkHere.cmd once, then try again.");
                return;
            }

            if (!File.Exists(electronExe))
            {
                Fail("The Electron runtime is missing. Run Setup-MarkHere.cmd again.");
                return;
            }

            var commandLine = new StringBuilder();
            commandLine.Append(Quote(appDir));
            foreach (string arg in args)
            {
                commandLine.Append(' ');
                commandLine.Append(Quote(arg));
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = electronExe,
                Arguments = commandLine.ToString(),
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            startInfo.EnvironmentVariables["NODE_ENV"] = "production";
            startInfo.EnvironmentVariables.Remove("ELECTRON_RENDERER_URL");

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
            if (c == '\\')
            {
                backslashes++;
                continue;
            }

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

if (-not (Test-Path $launcherPath)) {
  throw "Launcher compilation did not create $launcherPath"
}

Write-Host "Created $launcherPath"
