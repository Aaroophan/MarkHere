import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')
const reportPath = join(desktop, '.security-probe.json')
const require = createRequire(import.meta.url)
const electronPath = require('electron')

await rm(reportPath, { force: true })

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(electronPath, ['.'], {
    cwd: desktop,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MARKHERE_SECURITY_PROBE_FILE: reportPath
    },
    stdio: 'inherit',
    windowsHide: true
  })
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})

if (exitCode !== 0) throw new Error(`Electron security probe exited with code ${exitCode}`)
const report = JSON.parse(await readFile(reportPath, 'utf8'))
await rm(reportPath, { force: true })

const failures = []
const expect = (condition, message) => { if (!condition) failures.push(message) }
const prefs = report.preferences ?? {}
const renderer = report.renderer ?? {}

expect(report.url?.startsWith('markhere://app/'), `production URL is not markhere://app: ${report.url}`)
expect(prefs.nodeIntegration === false, 'nodeIntegration must be false')
expect(prefs.nodeIntegrationInWorker === false, 'nodeIntegrationInWorker must be false')
expect(prefs.nodeIntegrationInSubFrames === false, 'nodeIntegrationInSubFrames must be false')
expect(prefs.contextIsolation === true, 'contextIsolation must be true')
expect(prefs.sandbox === true, 'sandbox must be true')
expect(prefs.webSecurity === true, 'webSecurity must be true')
expect(prefs.webviewTag === false, 'webviewTag must be false')
expect(renderer.origin === 'markhere://app', `unexpected renderer origin: ${renderer.origin}`)
expect(renderer.hasNodeProcess === false, 'renderer unexpectedly has process')
expect(renderer.hasRequire === false, 'renderer unexpectedly has require')
expect(renderer.exposesElectron === false, 'renderer unexpectedly exposes window.electron')
expect(renderer.exposesGenericInvoke === false, 'renderer bridge exposes generic IPC')
expect(renderer.bridgeVersion === 1, 'renderer bridge version mismatch')

const expectedKeys = ['app','clipboard','dialogs','events','exports','files','recovery','resources','settings','shell','updates','window','workspaces']
expect(JSON.stringify(renderer.bridgeKeys) === JSON.stringify(expectedKeys), `bridge keys mismatch: ${JSON.stringify(renderer.bridgeKeys)}`)
expect(renderer.malformedResult?.ok === false && renderer.malformedResult?.error?.code === 'IPC_INVALID_ARGUMENTS', 'malformed IPC was not rejected by runtime validation')
expect(renderer.fakeSaveResult?.ok === false && renderer.fakeSaveResult?.error?.code === 'SEC_CAPABILITY_NOT_OWNED', 'fake save did not fail capability ownership')
expect(renderer.afterMalformedResult?.ok === true, 'main process did not remain usable after malformed IPC')

if (failures.length) throw new Error(`Secure Electron probe failed:\n- ${failures.join('\n- ')}`)
console.log('Runtime secure-shell probe passed')
