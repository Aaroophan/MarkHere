import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  ApiResult,
  FileFingerprint,
  RecoveryDocumentDTO,
  RecoverySummary,
  RecoveryUpdateRequest,
  RecoveryUpdateResult,
  TextFormatMetadata
} from '@markhere/ipc-contract'
import { failure, ok } from '../services/api-results'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

interface RecoverySnapshotFile {
  readonly schemaVersion: 1
  readonly id: string
  readonly documentId: string
  readonly windowId: string
  readonly createdAt: string
  readonly revision: number
  readonly persistedRevision: number
  readonly markdown: string
  readonly originalFile: { readonly displayPath: string; readonly stableHintHash?: string } | null
  readonly textFormat: TextFormatMetadata
  readonly baseDiskFingerprint: FileFingerprint | null
  readonly appVersion: string
}

function stableHint(path: string): string {
  return createHash('sha256').update(path).digest('hex')
}

export class RecoveryService {
  readonly #byDocument = new Map<string, string>()

  async updateSnapshot(request: RecoveryUpdateRequest, windowId: string): Promise<ApiResult<RecoveryUpdateResult>> {
    if (request.revision === request.persistedRevision) {
      await this.discardForDocument(request.documentId, request.revision)
      return ok({ snapshotId: null, savedRevision: request.revision })
    }
    try {
      const paths = getApplicationStoragePaths()
      await mkdir(paths.recovery, { recursive: true, mode: 0o700 })
      const snapshotId = this.#byDocument.get(request.documentId) ?? randomUUID()
      const snapshot: RecoverySnapshotFile = {
        schemaVersion: 1,
        id: snapshotId,
        documentId: request.documentId,
        windowId,
        createdAt: new Date().toISOString(),
        revision: request.revision,
        persistedRevision: request.persistedRevision,
        markdown: request.markdown,
        originalFile: request.displayPath ? { displayPath: request.displayPath, stableHintHash: stableHint(request.displayPath) } : null,
        textFormat: request.textFormat ?? { encoding: 'utf8', lineEnding: 'lf', hasFinalNewline: false, bom: false },
        baseDiskFingerprint: request.baseDiskFingerprint ?? null,
        appVersion: app.getVersion()
      }
      await writeJsonAtomic(join(paths.recovery, `${snapshotId}.json`), snapshot)
      this.#byDocument.set(request.documentId, snapshotId)
      return ok({ snapshotId, savedRevision: request.revision })
    } catch (error) {
      return failure('RECOVERY_WRITE_FAILED', 'filesystem', 'error.recoveryWriteFailed', true, { systemCode: (error as NodeJS.ErrnoException).code ?? 'UNKNOWN' }) as ApiResult<RecoveryUpdateResult>
    }
  }

  async listRecoverable(): Promise<ApiResult<RecoverySummary[]>> {
    try {
      const paths = getApplicationStoragePaths()
      await mkdir(paths.recovery, { recursive: true, mode: 0o700 })
      const entries = await readdir(paths.recovery, { withFileTypes: true })
      const summaries: RecoverySummary[] = []
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const snapshot = await this.#read(join(paths.recovery, entry.name))
        if (!snapshot) continue
        this.#byDocument.set(snapshot.documentId, snapshot.id)
        summaries.push({
          snapshotId: snapshot.id,
          documentId: snapshot.documentId,
          createdAt: snapshot.createdAt,
          revision: snapshot.revision,
          ...(snapshot.originalFile?.displayPath ? { displayPath: snapshot.originalFile.displayPath } : {}),
          title: snapshot.originalFile?.displayPath?.split(/[\\/]/).pop() ?? 'Untitled'
        })
      }
      summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return ok(summaries)
    } catch (error) {
      return failure('RECOVERY_LIST_FAILED', 'filesystem', 'error.recoveryListFailed', true) as ApiResult<RecoverySummary[]>
    }
  }

  async getSnapshot(snapshotId: string): Promise<ApiResult<RecoveryDocumentDTO>> {
    const snapshot = await this.#read(join(getApplicationStoragePaths().recovery, `${snapshotId}.json`))
    if (!snapshot) return failure('RECOVERY_NOT_FOUND', 'filesystem', 'error.recoveryNotFound', true)
    return ok({
      snapshotId: snapshot.id,
      documentId: snapshot.documentId,
      markdown: snapshot.markdown,
      revision: snapshot.revision,
      persistedRevision: snapshot.persistedRevision,
      createdAt: snapshot.createdAt,
      title: snapshot.originalFile?.displayPath?.split(/[\\/]/).pop() ?? 'Untitled',
      ...(snapshot.originalFile?.displayPath ? { displayPath: snapshot.originalFile.displayPath } : {}),
      textFormat: snapshot.textFormat,
      baseDiskFingerprint: snapshot.baseDiskFingerprint
    })
  }

  async discard(snapshotId: string): Promise<ApiResult<void>> {
    try {
      const snapshot = await this.#read(join(getApplicationStoragePaths().recovery, `${snapshotId}.json`))
      await unlink(join(getApplicationStoragePaths().recovery, `${snapshotId}.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
      if (snapshot) this.#byDocument.delete(snapshot.documentId)
      return ok(undefined)
    } catch {
      return failure('RECOVERY_DISCARD_FAILED', 'filesystem', 'error.recoveryDiscardFailed', true)
    }
  }

  async discardForDocument(documentId: string, throughRevision?: number): Promise<ApiResult<void>> {
    const listing = await this.listRecoverable()
    if (!listing.ok) return listing as ApiResult<void>
    for (const summary of listing.data) {
      if (summary.documentId !== documentId) continue
      if (throughRevision !== undefined && summary.revision > throughRevision) continue
      await this.discard(summary.snapshotId)
    }
    return ok(undefined)
  }


  async hasRecoverableForWindow(windowId: string): Promise<boolean> {
    return (await this.#snapshotsForWindow(windowId)).length > 0
  }

  async discardForWindow(windowId: string): Promise<void> {
    for (const snapshot of await this.#snapshotsForWindow(windowId)) await this.discard(snapshot.id)
  }

  async #snapshotsForWindow(windowId: string): Promise<RecoverySnapshotFile[]> {
    const paths = getApplicationStoragePaths()
    await mkdir(paths.recovery, { recursive: true, mode: 0o700 })
    const entries = await readdir(paths.recovery, { withFileTypes: true })
    const snapshots: RecoverySnapshotFile[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const snapshot = await this.#read(join(paths.recovery, entry.name))
      if (snapshot?.windowId === windowId && snapshot.revision !== snapshot.persistedRevision) snapshots.push(snapshot)
    }
    return snapshots
  }

  async #read(path: string): Promise<RecoverySnapshotFile | null> {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<RecoverySnapshotFile>
      if (raw.schemaVersion !== 1 || typeof raw.id !== 'string' || typeof raw.documentId !== 'string' || typeof raw.markdown !== 'string' || typeof raw.revision !== 'number' || typeof raw.persistedRevision !== 'number' || !raw.textFormat) return null
      return raw as RecoverySnapshotFile
    } catch { return null }
  }
}
