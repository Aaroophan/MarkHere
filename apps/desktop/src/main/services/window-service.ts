import { BrowserWindow, type WebContents } from 'electron'
import type { ApiResult } from '@markhere/ipc-contract'
import { failure, ok } from './api-results'
import type { WindowManager } from '../windows/window-manager'

export class WindowService {
  readonly #windows: WindowManager

  constructor(windows: WindowManager) {
    this.#windows = windows
  }

  #fromSender(sender: WebContents): BrowserWindow | null {
    return BrowserWindow.fromWebContents(sender)
  }

  minimize(sender: WebContents): void {
    this.#fromSender(sender)?.minimize()
  }

  toggleMaximize(sender: WebContents): void {
    const window = this.#fromSender(sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  }

  close(sender: WebContents): void {
    void this.#windows.requestCloseFromSender(sender.id)
  }

  toggleFullScreen(sender: WebContents): void {
    const window = this.#fromSender(sender)
    if (window) window.setFullScreen(!window.isFullScreen())
  }

  isMaximized(sender: WebContents): ApiResult<boolean> {
    const window = this.#fromSender(sender)
    return window ? ok(window.isMaximized()) : failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
  }

  isFullScreen(sender: WebContents): ApiResult<boolean> {
    const window = this.#fromSender(sender)
    return window ? ok(window.isFullScreen()) : failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
  }

  setAlwaysOnTop(sender: WebContents, enabled: boolean): ApiResult<void> {
    const window = this.#fromSender(sender)
    if (!window) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    window.setAlwaysOnTop(enabled)
    return ok(undefined)
  }
}
