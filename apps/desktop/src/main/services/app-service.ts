import { app, dialog, type WebContents } from 'electron'
import type { ApiResult, AppInfo, PlatformInfo, SettingsSection } from '@markhere/ipc-contract'
import { MARKHERE_BRIDGE_VERSION, MARKHERE_PRODUCT_NAME } from '@markhere/shared'
import { ok } from './api-results'
import type { WindowManager } from '../windows/window-manager'

function releaseChannel(version: string): AppInfo['channel'] {
  if (version.includes('alpha')) return 'alpha'
  if (version.includes('beta')) return 'beta'
  if (process.env.NODE_ENV !== 'production') return 'dev'
  return 'stable'
}

export class AppService {
  readonly #windows: WindowManager
  readonly #requestQuit: () => Promise<void>

  constructor(windows: WindowManager, requestQuit: () => Promise<void>) {
    this.#windows = windows
    this.#requestQuit = requestQuit
  }

  getInfo(): ApiResult<AppInfo> {
    const version = app.getVersion()
    return ok({
      name: MARKHERE_PRODUCT_NAME,
      version,
      channel: releaseChannel(version),
      electron: process.versions.electron ?? '',
      chromium: process.versions.chrome ?? '',
      node: process.versions.node,
      bridgeVersion: MARKHERE_BRIDGE_VERSION
    })
  }

  getPlatformInfo(): ApiResult<PlatformInfo> {
    return ok({ platform: process.platform, arch: process.arch })
  }

  async requestQuit(): Promise<ApiResult<void>> {
    await this.#requestQuit()
    return ok(undefined)
  }

  async openAbout(sender: WebContents): Promise<ApiResult<void>> {
    const owner = this.#windows.list().find((window) => window.webContents.id === sender.id)
    const options = {
      type: 'info' as const,
      title: 'About MarkHere',
      message: 'MarkHere',
      detail: `Version ${app.getVersion()}\nSecure Electron Markdown desktop shell`,
      buttons: ['OK'],
      noLink: true
    }
    if (owner) await dialog.showMessageBox(owner, options)
    else await dialog.showMessageBox(options)
    return ok(undefined)
  }

  openSettings(_section?: SettingsSection): ApiResult<void> {
    this.#windows.createSettingsWindow()
    return ok(undefined)
  }
}
