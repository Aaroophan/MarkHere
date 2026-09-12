import type { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

export async function maybeWriteSecurityProbe(window: BrowserWindow): Promise<void> {
  const outputPath = process.env.MARKHERE_SECURITY_PROBE_FILE
  if (!outputPath) return

  const preferences = window.webContents.getLastWebPreferences()
  const renderer = await window.webContents.executeJavaScript(`(async () => {
    const malformedResult = await window.markhere.shell.openExternal({ not: 'a string' })
    const fakeSaveResult = await window.markhere.files.saveDocument({
      documentId: 'fake-document',
      revision: 1,
      markdown: '# probe',
      expectedDiskFingerprint: null,
      textFormat: { encoding: 'utf-8', lineEnding: 'lf', hasFinalNewline: true, bom: false }
    })
    const afterMalformedResult = await window.markhere.app.getInfo()
    return {
      origin: location.origin,
      protocol: location.protocol,
      hasNodeProcess: typeof process !== 'undefined',
      hasRequire: typeof require !== 'undefined',
      bridgeVersion: window.markhere?.version ?? null,
      bridgeKeys: window.markhere ? Object.keys(window.markhere).sort() : [],
      exposesGenericInvoke: Boolean(window.markhere?.invoke || window.markhere?.send || window.markhere?.ipc),
      exposesElectron: typeof window.electron !== 'undefined',
      malformedResult,
      fakeSaveResult,
      afterMalformedResult
    }
  })()`, false) as Record<string, unknown>

  const report = {
    url: window.webContents.getURL(),
    preferences: {
      nodeIntegration: preferences.nodeIntegration,
      nodeIntegrationInWorker: preferences.nodeIntegrationInWorker,
      nodeIntegrationInSubFrames: preferences.nodeIntegrationInSubFrames,
      contextIsolation: preferences.contextIsolation,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
      webviewTag: preferences.webviewTag,
      devTools: preferences.devTools
    },
    renderer
  }

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
