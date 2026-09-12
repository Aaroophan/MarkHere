import { access, readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const repo = fileURLToPath(new URL('..', import.meta.url))
const violations = []
const required = [
  'apps/desktop/src/main/app-lifecycle.ts',
  'apps/desktop/src/main/windows/window-manager.ts',
  'apps/desktop/src/main/windows/editor-web-preferences.ts',
  'apps/desktop/src/main/protocols/app-protocol.ts',
  'apps/desktop/src/main/security/trusted-web-contents-registry.ts',
  'apps/desktop/src/main/security/session-security.ts',
  'apps/desktop/src/main/ipc/validated-ipc.ts',
  'apps/desktop/src/main/ipc/register-ipc.ts',
  'apps/desktop/src/main/commands/command-registry.ts',
  'apps/desktop/src/preload/transport.ts',
  'apps/desktop/src/preload/bridge.ts',
  'apps/desktop/src/renderer/index.html',
  'packages/ipc-contract/src/bridge.ts',
  'packages/ipc-contract/src/internal-channels.ts',
  'packages/ipc-contract/src/schemas.ts',
  'apps/desktop/test/security/app-protocol.test.ts',
  'docs/development/issue-02-security-baseline.md'
]

for (const path of required) {
  try { await access(join(repo, path)) } catch { violations.push(`missing required Issue-2 file: ${path}`) }
}

async function text(path) { return readFile(join(repo, path), 'utf8') }

const prefs = await text('apps/desktop/src/main/windows/editor-web-preferences.ts')
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
]) if (!prefs.includes(fragment)) violations.push(`BrowserWindow baseline missing: ${fragment}`)

const lifecycle = await text('apps/desktop/src/main/app-lifecycle.ts')
if (!lifecycle.includes('requestSingleInstanceLock')) violations.push('single-instance lock is not implemented')
if (!lifecycle.includes("'second-instance'")) violations.push('second-instance coordination is not implemented')
if (!lifecycle.includes('markRendererReady')) violations.push('startup queue is not gated on renderer readiness')

const protocol = await text('apps/desktop/src/main/protocols/app-protocol.ts')
const protocolPath = await text('apps/desktop/src/main/protocols/app-protocol-path.ts')
const protocolSecurity = `${protocol}\n${protocolPath}`
for (const fragment of [
  'registerSchemesAsPrivileged',
  'standard: true',
  'secure: true',
  'supportFetchAPI: true',
  'corsEnabled: false',
  'bypassCSP: false',
  'ALLOWED_ASSET_MIME_TYPES',
  'mimeType',
  "x-content-type-options', 'nosniff",
  'path-traversal',
  'scope-escape'
]) if (!protocolSecurity.includes(fragment)) violations.push(`custom protocol guard missing: ${fragment}`)

const rendererHtml = await text('apps/desktop/src/renderer/index.html')
if (!rendererHtml.includes("default-src 'none'")) violations.push('renderer CSP must default deny')
if (rendererHtml.includes("'unsafe-eval'")) violations.push('renderer CSP must not enable unsafe-eval')
if (!rendererHtml.includes("object-src 'none'")) violations.push('renderer CSP must block object-src')
if (!rendererHtml.includes("frame-src 'none'")) violations.push('renderer CSP must block frames')

const bridge = await text('apps/desktop/src/preload/bridge.ts')
const expectedNamespaces = [
  'app:', 'window:', 'dialogs:', 'files:', 'workspaces:', 'resources:',
  'settings:', 'recovery:', 'exports:', 'shell:', 'clipboard:', 'updates:', 'events:'
]
for (const namespace of expectedNamespaces) if (!bridge.includes(namespace)) violations.push(`preload bridge missing namespace ${namespace}`)
for (const forbidden of ['ipcRenderer', 'window.electron', 'process.env', 'node:fs', 'child_process']) {
  if (bridge.includes(forbidden)) violations.push(`preload bridge exposes/references forbidden authority: ${forbidden}`)
}

const preloadIndex = await text('apps/desktop/src/preload/index.ts')
if (!preloadIndex.includes("exposeInMainWorld('markhere'")) violations.push('preload does not expose window.markhere')
if (preloadIndex.includes('ipcRenderer')) violations.push('preload entry must not expose raw ipcRenderer')

const transport = await text('apps/desktop/src/preload/transport.ts')
if (!transport.includes('ipcRenderer.invoke') || !transport.includes('ipcRenderer.send')) {
  violations.push('reviewed preload transport is incomplete')
}

const registry = await text('apps/desktop/src/main/security/trusted-web-contents-registry.ts')
for (const fragment of ['frame.origin', 'frame.parent !== null', 'sender.isDestroyed()', '#records']) {
  if (!registry.includes(fragment)) violations.push(`sender validation guard missing: ${fragment}`)
}

const sessions = await text('apps/desktop/src/main/security/session-security.ts')
if (!sessions.includes('setPermissionCheckHandler(() => false)')) violations.push('permission checks must fail closed')
if (!sessions.includes('callback(false)')) violations.push('permission requests must fail closed')

const shell = await text('apps/desktop/src/main/services/shell-service.ts')
if (!shell.includes('classifyExternalUrl')) violations.push('shell service must use central URL policy')
if (shell.includes('shell.openExternal(rawUrl)')) violations.push('shell must not launch raw renderer URL input')

const ipcContract = await text('packages/ipc-contract/src/internal-channels.ts')
const channelStrings = [...ipcContract.matchAll(/'mh:v1:[^']+'/g)].map((match) => match[0])
if (channelStrings.length < 40) violations.push(`typed IPC contract unexpectedly small (${channelStrings.length} channels)`)
if (channelStrings.some((channel) => !channel.startsWith("'mh:v1:"))) violations.push('IPC channel escaped mh:v1 namespace')

const schemas = await text('packages/ipc-contract/src/schemas.ts')
if (!schemas.includes('INVOKE_ARG_SCHEMAS') || !schemas.includes('SEND_ARG_SCHEMAS')) violations.push('runtime IPC schema maps are missing')
if (!schemas.includes('32 * 1024 * 1024')) violations.push('large Markdown IPC request budget is not explicit')
if (!schemas.includes('8192')) violations.push('external URL/control IPC size budget is not explicit')

const commandRegistry = await text('apps/desktop/src/main/commands/command-registry.ts')
for (const fragment of ["when: 'always'", "when: 'document'", "when: 'saveable-document'", "when: 'editable-document'", 'isEnabled(', 'dispatch(']) {
  if (!commandRegistry.includes(fragment)) violations.push(`command model missing enablement/routing invariant: ${fragment}`)
}

const windowManager = await text('apps/desktop/src/main/windows/window-manager.ts')
for (const fragment of ["setWindowOpenHandler(() => ({ action: 'deny' }))", "'will-navigate'", "'will-redirect'"]) {
  if (!windowManager.includes(fragment)) violations.push(`navigation/window-open protection missing: ${fragment}`)
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else if (/\.(?:ts|tsx|js|mjs|cjs|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}
const desktopSources = await walk(join(repo, 'apps/desktop/src'))
for (const file of desktopSources) {
  const rel = relative(repo, file).replaceAll('\\', '/')
  const source = await readFile(file, 'utf8')
  if (/new\s+BrowserWindow\s*\(/.test(source) && rel !== 'apps/desktop/src/main/windows/window-manager.ts') {
    violations.push(`${rel}: BrowserWindow construction must be centralized in WindowManager`)
  }
  if (/\bloadFile\s*\(/.test(source)) violations.push(`${rel}: application pages must not use file:// loadFile`)
}


const electronViteConfig = await text('apps/desktop/electron.vite.config.ts')
if (!electronViteConfig.includes('externalizeDeps: false')) violations.push('sandboxed preload dependencies must be fully bundled')
if (!electronViteConfig.includes("format: 'cjs'")) violations.push('sandboxed preload must build as CommonJS')
if (!electronViteConfig.includes("entryFileNames: 'index.cjs'")) violations.push('sandboxed preload output must be index.cjs')
if (!windowManager.includes("preload/index.cjs")) violations.push('WindowManager must point at the bundled sandbox preload')

const rawIpcFiles = []
for (const file of desktopSources) {
  const rel = relative(repo, file).replaceAll('\\', '/')
  const source = await readFile(file, 'utf8')
  if (/ipcRenderer\s*\.(?:send|invoke|on|once|sendSync)/.test(source)) rawIpcFiles.push(rel)
}
if (rawIpcFiles.length !== 1 || rawIpcFiles[0] !== 'apps/desktop/src/preload/transport.ts') {
  violations.push(`raw ipcRenderer must exist only in preload/transport.ts; found ${rawIpcFiles.join(', ') || 'none'}`)
}

if (violations.length) {
  console.error(`Secure shell violations:\n${violations.map((v) => `- ${v}`).join('\n')}`)
  process.exit(1)
}
console.log(`Issue-2 secure shell structure OK (${channelStrings.length} typed channel references checked)`)
