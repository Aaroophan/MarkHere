import { readFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const setup = await readFile(join(root, 'Setup-MarkHere.cmd'), 'utf8')
const launcher = await readFile(join(root, 'scripts/windows/create-local-launcher.ps1'), 'utf8')

for (const fragment of [
  'NODE_VERSION=22.16.0',
  'PNPM_VERSION=10.33.4',
  'SHASUMS256.txt',
  'Get-FileHash -Algorithm SHA256',
  'install --frozen-lockfile',
  'exec install-electron --no',
  '--filter @markhere/desktop build',
  'create-local-launcher.ps1',
  'MarkHere.exe'
]) if (!setup.includes(fragment)) errors.push(`Setup-MarkHere.cmd missing: ${fragment}`)

for (const fragment of [
  'apps", "desktop',
  'node_modules", "electron", "dist", "electron.exe',
  'out", "main", "index.js',
  'NODE_ENV"] = "production"',
  'ELECTRON_RENDERER_URL',
  'UseShellExecute = false'
]) if (!launcher.includes(fragment)) errors.push(`local launcher missing: ${fragment}`)

if (/setx\s+PATH|\[Environment\]::SetEnvironmentVariable\([^,]+,[^,]+,'Machine'/iu.test(setup)) errors.push('setup must not mutate the system PATH')
for (const path of ['pnpm-lock.yaml', 'build/icons/markhere.ico', 'build/windows/installer.nsh']) {
  try { await access(join(root, path)) } catch { errors.push(`missing ${path}`) }
}

if (errors.length) {
  console.error(`Local Windows setup violations:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}
console.log('One-click local Windows setup and MarkHere.exe launcher structure OK')
