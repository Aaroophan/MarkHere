import { access, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { toolchain } from './toolchain-versions.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const required = [
  'package.json',
  'pnpm-workspace.yaml',
  '.nvmrc',
  '.node-version',
  '.npmrc',
  'tsconfig.base.json',
  'eslint.config.mjs',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'apps/desktop/package.json',
  'apps/desktop/src/main/index.ts',
  'apps/desktop/src/main/windows/editor-web-preferences.ts',
  'apps/desktop/src/preload/index.ts',
  'apps/desktop/src/renderer/src/main.ts',
  'apps/desktop/src/workers/index.ts',
  'apps/desktop/build/icons/markhere.svg',
  'apps/desktop/build/icons/markhere.png',
  'apps/desktop/build/icons/markhere.ico',
  'docs/development/branch-protection.md',
  'docs/development/product-identity.md',
  'docs/provenance/provenance.json',
  'docs/provenance/licenses/MARKTEXT-MIT.txt',
  '.github/workflows/foundation.yml'
]

for (const path of required) await access(join(repo, path))

for (const icon of [
  'apps/desktop/build/icons/markhere.png',
  'apps/desktop/build/icons/markhere.ico'
]) {
  const info = await stat(join(repo, icon))
  if (info.size <= 0) throw new Error(`${icon} is empty`)
}

const root = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
if (root.packageManager !== `pnpm@${toolchain.pnpm}`) {
  throw new Error(`packageManager must be pnpm@${toolchain.pnpm}`)
}
if (root.engines?.node !== '22.16.x' || root.engines?.pnpm !== '10.33.x') {
  throw new Error('Root engine ranges drifted from the pinned Issue-1 toolchain')
}
if (root.devDependencies?.typescript !== toolchain.typescript) throw new Error('TypeScript baseline drift')
if (root.devDependencies?.['@eslint/js'] !== '9.39.4') throw new Error('@eslint/js baseline drift')

const workspace = await readFile(join(repo, 'pnpm-workspace.yaml'), 'utf8')
if (!workspace.includes("apps/*") || !workspace.includes("packages/*")) {
  throw new Error('Workspace globs are incomplete')
}
if (!workspace.includes('disallowWorkspaceCycles: true')) {
  throw new Error('Workspace cycle protection must remain enabled')
}

const desktop = JSON.parse(await readFile(join(repo, 'apps/desktop/package.json'), 'utf8'))
if (desktop.dependencies.vue !== toolchain.vue || desktop.dependencies.pinia !== toolchain.pinia) {
  throw new Error('Renderer baseline drift')
}
if (desktop.devDependencies.electron !== toolchain.electron) throw new Error('Electron baseline drift')
if (desktop.devDependencies['electron-vite'] !== toolchain.electronVite) {
  throw new Error('electron-vite baseline drift')
}
if (desktop.devDependencies.vite !== toolchain.vite) throw new Error('Vite baseline drift')

const sourceEditor = JSON.parse(
  await readFile(join(repo, 'packages/source-editor/package.json'), 'utf8')
)
for (const dependency of [
  '@codemirror/lang-markdown',
  '@codemirror/state',
  '@codemirror/view',
  'codemirror'
]) {
  if (!sourceEditor.dependencies?.[dependency]) {
    throw new Error(`CodeMirror 6 dependency '${dependency}' must be explicit`)
  }
}

const main = await readFile(join(repo, 'apps/desktop/src/main/index.ts'), 'utf8')
if (!main.includes("app.setPath('userData'")) {
  throw new Error('Main process must establish an explicit MarkHere userData directory')
}
if (/MarkText[\\/]/.test(main)) {
  throw new Error('MarkHere main process must not write runtime data into a MarkText directory')
}

const preferences = await readFile(
  join(repo, 'apps/desktop/src/main/windows/editor-web-preferences.ts'),
  'utf8'
)
for (const fragment of [
  'nodeIntegration: false',
  'nodeIntegrationInWorker: false',
  'nodeIntegrationInSubFrames: false',
  'contextIsolation: true',
  'sandbox: true',
  'webSecurity: true',
  'allowRunningInsecureContent: false',
  'experimentalFeatures: false',
  'webviewTag: false'
]) {
  if (!preferences.includes(fragment)) throw new Error(`Missing security baseline: ${fragment}`)
}

console.log('Issue-1 foundation structure and identity OK')
