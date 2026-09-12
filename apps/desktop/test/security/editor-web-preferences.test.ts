import { describe, expect, it } from 'vitest'
import { createEditorWebPreferences } from '../../src/main/windows/editor-web-preferences'

describe('BrowserWindow security preferences', () => {
  it('keeps the renderer sandboxed and isolated explicitly', () => {
    const preferences = createEditorWebPreferences({
      preloadPath: 'C:\\MarkHere\\preload.mjs',
      isDevelopment: false
    })
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      devTools: false,
      navigateOnDragDrop: false
    })
  })

  it('enables DevTools only for development by default', () => {
    expect(createEditorWebPreferences({ preloadPath: '/preload.mjs', isDevelopment: true }).devTools).toBe(true)
    expect(createEditorWebPreferences({ preloadPath: '/preload.mjs', isDevelopment: false }).devTools).toBe(false)
  })
})
