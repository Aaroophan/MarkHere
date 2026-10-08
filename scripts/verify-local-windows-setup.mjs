import { readFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const setup = await readFile(join(root, 'Setup-MarkHere.cmd'), 'utf8')
const launcher = await readFile(join(root, 'scripts/windows/create-local-launcher.ps1'), 'utf8')
const protocolPath = await readFile(join(root, 'apps/desktop/src/main/protocols/app-protocol-path.ts'), 'utf8')

for (const fragment of [
  "$NodeVersion = '22.16.0'",
  "$PnpmVersion = '10.33.4'",
  'SHASUMS256.txt',
  'Get-FileHash -Algorithm SHA256',
  "@('install', '--frozen-lockfile')",
  "'exec', 'install-electron', '--no'",
  "@('package:win:dir')",
  "dist\\win-unpacked\\markhere.exe",
  'MarkHere.exe'
]) if (!setup.includes(fragment)) errors.push(`Setup-MarkHere.cmd missing: ${fragment}`)

for (const fragment of [
  'dist", "win-unpacked", "markhere.exe',
  'UseShellExecute = false',
  'Process.Start(startInfo)'
]) if (!launcher.includes(fragment)) errors.push(`local launcher missing: ${fragment}`)

for (const forbidden of ['NODE_ENV', 'ELECTRON_RENDERER_URL', 'apps", "desktop', 'node_modules", "electron"']) {
  if (launcher.includes(forbidden)) errors.push(`local launcher must not use hybrid source/Electron path: ${forbidden}`)
}

for (const fragment of ["'.ttf': 'font/ttf'", "'.otf': 'font/otf'"]) if (!protocolPath.includes(fragment)) errors.push(`production app protocol missing font type: ${fragment}`)

if (/setx\s+PATH|\[Environment\]::SetEnvironmentVariable\([^,]+,[^,]+,'Machine'/iu.test(setup)) errors.push('setup must not mutate the system PATH')
for (const path of ['pnpm-lock.yaml', 'build/icons/markhere.ico', 'build/windows/installer.nsh']) {
  try { await access(join(root, path)) } catch { errors.push(`missing ${path}`) }
}

if (errors.length) {
  console.error(`Local Windows setup violations:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}
console.log('One-click Windows setup now packages and launches the real MarkHere application')
