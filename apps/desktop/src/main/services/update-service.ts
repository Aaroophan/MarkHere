import { app } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { ApiResult, UpdateStatus } from '@markhere/ipc-contract'
import { failure, ok } from './api-results'
import type { LocalLogger } from '../logging/local-logger'

function channelForVersion(version: string): 'alpha' | 'beta' | 'stable' {
  if (version.includes('-alpha.')) return 'alpha'
  if (version.includes('-beta.')) return 'beta'
  return 'stable'
}

export class UpdateService {
  #status: UpdateStatus = { state: 'idle' }
  readonly #logger: LocalLogger
  readonly #publish: (status: UpdateStatus) => void

  constructor(logger: LocalLogger, publish: (status: UpdateStatus) => void) {
    this.#logger = logger
    this.#publish = publish
    const channel = channelForVersion(app.getVersion())
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = channel !== 'stable'
    autoUpdater.channel = channel
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.#set({ state: 'checking' }))
    autoUpdater.on('update-available', (info: UpdateInfo) => this.#set({ state: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => this.#set({ state: 'not-available' }))
    autoUpdater.on('download-progress', (progress) => this.#set({ state: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)) }))
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => this.#set({ state: 'downloaded', version: info.version, percent: 100 }))
    autoUpdater.on('error', () => this.#set({ state: 'error', errorCode: 'UPDATE_FAILED' }))
  }

  getStatus(): ApiResult<UpdateStatus> { return ok(this.#status) }

  async check(): Promise<ApiResult<UpdateStatus>> {
    if (!app.isPackaged) return failure('UPDATE_NOT_PACKAGED', 'update', 'error.updateNotPackaged', true)
    try {
      this.#logger.info('update.check.started')
      await autoUpdater.checkForUpdates()
      return ok(this.#status)
    } catch {
      this.#set({ state: 'error', errorCode: 'UPDATE_CHECK_FAILED' })
      return failure('UPDATE_CHECK_FAILED', 'update', 'error.updateCheckFailed', true)
    }
  }

  async download(): Promise<ApiResult<void>> {
    if (!app.isPackaged) return failure('UPDATE_NOT_PACKAGED', 'update', 'error.updateNotPackaged', true)
    if (this.#status.state !== 'available') return failure('UPDATE_NOT_AVAILABLE', 'update', 'error.updateNotAvailable', true)
    try { await autoUpdater.downloadUpdate(); return ok(undefined) }
    catch { this.#set({ state: 'error', errorCode: 'UPDATE_DOWNLOAD_FAILED' }); return failure('UPDATE_DOWNLOAD_FAILED', 'update', 'error.updateDownloadFailed', true) }
  }

  installAndRestart(): ApiResult<void> {
    if (this.#status.state !== 'downloaded') return failure('UPDATE_NOT_READY', 'update', 'error.updateNotReady', true)
    this.#logger.info('update.install.requested')
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return ok(undefined)
  }

  #set(status: UpdateStatus): void {
    this.#status = Object.freeze({ ...status })
    this.#publish(this.#status)
    this.#logger.info('update.status', { metadata: { state: status.state, version: status.version ?? null, percent: status.percent ?? null, errorCode: status.errorCode ?? null } })
  }
}
