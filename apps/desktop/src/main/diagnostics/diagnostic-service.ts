import { app, shell } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiResult, DiagnosticBundleDTO, RendererFaultReport, SafeModeStatusDTO } from '@markhere/ipc-contract'
import type { LocalLogger } from '../logging/local-logger'
import type { CrashHealthService } from './crash-health-service'
import { getApplicationStoragePaths } from '../storage/application-storage-paths'
import { failure, ok } from '../services/api-results'

export class DiagnosticService {
  readonly #logger: LocalLogger
  readonly #health: CrashHealthService
  constructor(logger: LocalLogger, health: CrashHealthService) { this.#logger = logger; this.#health = health }

  getSafeModeStatus(): ApiResult<SafeModeStatusDTO> { return ok({ active: this.#health.safeMode }) }

  async openLogsFolder(): Promise<ApiResult<void>> {
    await mkdir(this.#logger.directory, { recursive: true, mode: 0o700 })
    await shell.openPath(this.#logger.directory)
    return ok(undefined)
  }

  async clearLogs(): Promise<ApiResult<void>> { await this.#logger.clear(); return ok(undefined) }

  reportRendererFault(report: RendererFaultReport, windowId: string): ApiResult<void> {
    this.#logger.error('renderer.error.reported', { windowId, errorCode: 'RENDERER_ERROR', metadata: { kind: report.kind, component: report.component ?? null } })
    return ok(undefined)
  }

  async createBundle(): Promise<ApiResult<DiagnosticBundleDTO>> {
    try {
      const root = getApplicationStoragePaths().diagnostics
      await mkdir(root, { recursive: true, mode: 0o700 })
      const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
      const path = join(root, `markhere-diagnostics-${timestamp}.json`)
      const logs = await this.#logger.readRedactedLogs()
      const payload = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        disclosure: 'Contains app/build/platform metadata and redacted local operational logs. Excludes documents, recovery snapshots, clipboard, images, exports, credentials, and browser cache.',
        app: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged },
        platform: { platform: process.platform, arch: process.arch, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
        safeMode: this.#health.safeMode,
        logs
      }
      await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      this.#logger.info('diagnostics.bundle.created', { metadata: { basename: `markhere-diagnostics-${timestamp}.json`, logFiles: logs.length } })
      return ok({ displayPath: path, createdAt: payload.createdAt })
    } catch {
      return failure('DIAGNOSTIC_BUNDLE_FAILED', 'internal', 'error.diagnosticBundleFailed', true)
    }
  }
}
