import { app } from 'electron'
import { createStartupRequest, type StartupRequest } from './startup/startup-arguments'
import type { WindowManager } from './windows/window-manager'

export interface AppLifecycleOptions {
  readonly onStartupReady?: (request: StartupRequest) => void
}

export class AppLifecycle {
  readonly #preReadyQueue: StartupRequest[] = []
  readonly #readyQueue: StartupRequest[] = []
  readonly #onStartupReady: ((request: StartupRequest) => void) | undefined
  #windows: WindowManager | null = null
  #rendererReady = false
  #approvedQuit = false
  #quitInProgress = false

  constructor(options: AppLifecycleOptions = {}) {
    this.#onStartupReady = options.onStartupReady
  }

  initializeEarly(): boolean {
    const hasLock = app.requestSingleInstanceLock()
    if (!hasLock) {
      app.quit()
      return false
    }

    app.on('second-instance', (_event, argv, cwd) => {
      void this.enqueueFromArgv(getUserArgv(argv, app.isPackaged), 'second-instance', cwd)
      this.#windows?.focusOrCreateEditor()
    })

    app.on('open-file', (event, path) => {
      event.preventDefault()
      void this.enqueueRequest({
        source: 'open-file',
        newWindow: false,
        paths: [{ path, kind: 'file' }]
      })
    })

    app.on('open-url', (event) => {
      // Issue 2 intentionally does not grant arbitrary custom URL authority.
      // A future reviewed deep-link feature must add an ADR and parser.
      event.preventDefault()
    })

    app.on('before-quit', (event) => {
      if (this.#approvedQuit || this.#quitInProgress) return
      event.preventDefault()
      void this.requestQuit()
    })

    app.on('activate', () => {
      if (this.#windows?.list().length === 0) this.#windows.createEditorWindow()
      else this.#windows?.focusOrCreateEditor()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin' && !this.#quitInProgress) void this.requestQuit()
    })

    return true
  }

  attachWindowManager(windowManager: WindowManager): void {
    this.#windows = windowManager
  }

  async enqueueInitial(argv: readonly string[], cwd: string): Promise<void> {
    await this.enqueueFromArgv(argv, 'initial', cwd)
  }

  async enqueueFromArgv(
    argv: readonly string[],
    source: StartupRequest['source'],
    cwd: string
  ): Promise<void> {
    const request = await createStartupRequest(argv, source, cwd)
    if (request.paths.length === 0 && !request.newWindow && !request.mode) return
    await this.enqueueRequest(request)
  }

  async enqueueRequest(request: StartupRequest): Promise<void> {
    if (!this.#rendererReady) {
      this.#preReadyQueue.push(request)
      return
    }
    this.#readyQueue.push(request)
    this.#onStartupReady?.(request)
  }

  markRendererReady(_webContentsId: number): void {
    if (this.#rendererReady) return
    this.#rendererReady = true
    const queued = this.#preReadyQueue.splice(0)
    for (const request of queued) {
      this.#readyQueue.push(request)
      this.#onStartupReady?.(request)
    }
  }

  /** Issue 3 consumes this queue through FileService capability issuance. */
  drainReadyStartupRequests(): readonly StartupRequest[] {
    return this.#readyQueue.splice(0)
  }

  async requestQuit(): Promise<void> {
    if (this.#approvedQuit || this.#quitInProgress) return
    this.#quitInProgress = true
    try {
      const allowed = await (this.#windows?.requestApplicationQuit() ?? Promise.resolve(true))
      if (!allowed) return
      this.#approvedQuit = true
      app.quit()
    } finally {
      this.#quitInProgress = false
    }
  }
}

export function getUserArgv(argv: readonly string[], isPackaged: boolean): readonly string[] {
  return isPackaged ? argv.slice(1) : argv.slice(2)
}
