import type { WebPreferences } from 'electron'

export interface EditorWebPreferenceOptions {
  readonly preloadPath: string
  readonly isDevelopment: boolean
  readonly allowProductionDevTools?: boolean
}

export function createEditorWebPreferences(options: EditorWebPreferenceOptions): WebPreferences {
  return {
    preload: options.preloadPath,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    devTools: options.isDevelopment || options.allowProductionDevTools === true,
    spellcheck: true,
    navigateOnDragDrop: false
  }
}
