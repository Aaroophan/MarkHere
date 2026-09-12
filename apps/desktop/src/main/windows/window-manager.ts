import { BrowserWindow, screen, type Event, type Rectangle } from 'electron'
import { fileURLToPath } from 'node:url'
import { getApplicationEntryUrl, getApplicationOrigin } from '../protocols/app-protocol'
import { TrustedWebContentsRegistry, type TrustedWindowKind } from '../security/trusted-web-contents-registry'
import { installSessionSecurity } from '../security/session-security'
import { createEditorWebPreferences } from './editor-web-preferences'
import { clampWindowBounds, type WindowBoundsInput } from './window-bounds'
import { CloseCoordinator } from './close-coordinator'
import { CapabilityOwnershipRegistry } from '../security/capability-ownership-registry'
import { isAllowedApplicationNavigation } from '../security/navigation-policy'

interface ManagedWindow {
  readonly appWindowId: string
  readonly kind: TrustedWindowKind
  readonly browserWindow: BrowserWindow
}

export interface WindowManagerOptions {
  readonly trustedRegistry: TrustedWebContentsRegistry
  readonly capabilityRegistry: CapabilityOwnershipRegistry
  readonly closeCoordinator: CloseCoordinator
  readonly isDevelopment: boolean
  readonly developmentRendererUrl?: string
  readonly onWindowState?: (window: BrowserWindow) => void
  readonly onRendererReady?: (webContentsId: number) => void
  readonly onWindowDestroyed?: (webContentsId: number) => void
}

function preloadPath(): string {
  return fileURLToPath(new URL('../../preload/index.cjs', import.meta.url))
}

function normalizeOrigin(url: string): string {
  return new URL(url).origin
}

export class WindowManager {
  readonly #windows = new Map<number, ManagedWindow>()
  readonly #trustedRegistry: TrustedWebContentsRegistry
  readonly #capabilityRegistry: CapabilityOwnershipRegistry
  readonly #closeCoordinator: CloseCoordinator
  readonly #isDevelopment: boolean
  readonly #developmentRendererUrl: string | undefined
  readonly #onWindowState: ((window: BrowserWindow) => void) | undefined
  readonly #onRendererReady: ((webContentsId: number) => void) | undefined
  readonly #onWindowDestroyed: ((webContentsId: number) => void) | undefined
  #sessionSecurityInstalled = false

  constructor(options: WindowManagerOptions) {
    this.#trustedRegistry = options.trustedRegistry
    this.#capabilityRegistry = options.capabilityRegistry
    this.#closeCoordinator = options.closeCoordinator
    this.#isDevelopment = options.isDevelopment
    this.#developmentRendererUrl = options.developmentRendererUrl
    this.#onWindowState = options.onWindowState
    this.#onRendererReady = options.onRendererReady
    this.#onWindowDestroyed = options.onWindowDestroyed
  }

  createEditorWindow(bounds?: WindowBoundsInput): BrowserWindow {
    return this.#createWindow('editor', bounds)
  }

  createSettingsWindow(): BrowserWindow {
    const existing = [...this.#windows.values()].find((entry) => entry.kind === 'settings')
    if (existing && !existing.browserWindow.isDestroyed()) {
      existing.browserWindow.show()
      existing.browserWindow.focus()
      return existing.browserWindow
    }
    return this.#createWindow('settings', { width: 900, height: 720 })
  }

  getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow()
  }

  list(): readonly BrowserWindow[] {
    return [...this.#windows.values()].map((entry) => entry.browserWindow)
  }

  focusOrCreateEditor(): BrowserWindow {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) return focused
    const existing = [...this.#windows.values()].find((entry) => entry.kind === 'editor')?.browserWindow
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return existing
    }
    return this.createEditorWindow()
  }

  async requestCloseFromSender(senderId: number): Promise<boolean> {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id === senderId)
    if (!window) return false
    return this.#closeCoordinator.request(window)
  }

  async requestApplicationQuit(): Promise<boolean> {
    const windows = [...this.#windows.values()].map((entry) => entry.browserWindow).filter((window) => !window.isDestroyed())
    for (const window of windows) {
      const allowed = await this.#closeCoordinator.request(window)
      if (!allowed) return false
    }
    return true
  }

  #createWindow(kind: TrustedWindowKind, restoredBounds?: WindowBoundsInput): BrowserWindow {
    const bounds: Rectangle = clampWindowBounds(restoredBounds, screen.getAllDisplays())
    const targetUrl = this.#isDevelopment && this.#developmentRendererUrl
      ? `${this.#developmentRendererUrl}${kind === 'settings' ? '?surface=settings' : ''}`
      : getApplicationEntryUrl(kind)
    const expectedOrigin = this.#isDevelopment && this.#developmentRendererUrl
      ? normalizeOrigin(this.#developmentRendererUrl)
      : getApplicationOrigin()

    const window = new BrowserWindow({
      ...bounds,
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: kind === 'settings' ? 'MarkHere Settings' : 'MarkHere',
      backgroundColor: '#111318',
      webPreferences: createEditorWebPreferences({
        preloadPath: preloadPath(),
        isDevelopment: this.#isDevelopment
      })
    })

    if (!this.#sessionSecurityInstalled) {
      installSessionSecurity(window.webContents.session)
      this.#sessionSecurityInstalled = true
    }

    const trustedRecord = this.#trustedRegistry.register(window.webContents, kind, expectedOrigin)
    const appWindowId = trustedRecord.windowId
    this.#windows.set(window.id, { appWindowId, kind, browserWindow: window })
    this.#closeCoordinator.register(window)

    const preventUnexpectedNavigation = (event: Event, url: string): void => {
      if (!isAllowedApplicationNavigation(url, expectedOrigin)) event.preventDefault()
    }

    window.webContents.on('will-navigate', preventUnexpectedNavigation)
    window.webContents.on('will-redirect', preventUnexpectedNavigation)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const webContentsId = window.webContents.id

    window.webContents.on('did-finish-load', () => {
      this.#onRendererReady?.(webContentsId)
      window.show()
      this.emitWindowState(window)
    })

    window.on('maximize', () => this.emitWindowState(window))
    window.on('unmaximize', () => this.emitWindowState(window))
    window.on('enter-full-screen', () => this.emitWindowState(window))
    window.on('leave-full-screen', () => this.emitWindowState(window))
    window.on('always-on-top-changed', () => this.emitWindowState(window))

    window.on('close', (event) => {
      if (this.#closeCoordinator.consumeApproval(window.id)) return
      event.preventDefault()
      void this.#closeCoordinator.request(window)
    })

    window.once('closed', () => {
      this.#windows.delete(window.id)
      this.#trustedRegistry.unregister(webContentsId)
      this.#capabilityRegistry.revokeAllForWebContents(webContentsId)
      this.#onWindowDestroyed?.(webContentsId)
    })

    void window.loadURL(targetUrl)
    return window
  }

  emitWindowState(window: BrowserWindow): void {
    this.#onWindowState?.(window)
  }
}
