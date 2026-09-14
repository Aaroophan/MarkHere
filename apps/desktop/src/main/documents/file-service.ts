import { createHash, randomUUID } from 'node:crypto'
import { access, readFile, rename, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { shell } from 'electron'
import type {
  ApiResult,
  DocumentStatDTO,
  FileFingerprint,
  FileMutationResult,
  OpenDocumentDTO,
  SaveDocumentAsRequest,
  SaveDocumentRequest,
  SaveDocumentResult
} from '@markhere/ipc-contract'
import type { OpenedVia } from '@markhere/document-model'
import { failure, ok } from '../services/api-results'
import type { SelectionTokenStore } from '../services/selection-token-store'
import { FileCapabilityRegistry } from './file-capability-registry'
import { identifyExistingPath, normalizeTargetPath } from './path-identity'
import { decodeDocumentBytes, encodeDocumentText } from './text-codec'
import { fingerprintFile, fingerprintMatchesExpected } from './fingerprint'
import { atomicReplaceFile } from './atomic-write'
import { PerDocumentSaveQueue } from './save-queue'
import type { WatchService } from './watch-service'
import type { RecentDocumentStore } from '../storage/recent-document-store'
import type { ResourceCapabilityBroker } from '../resources/resource-capability-broker'

interface RuntimeDocumentRecord {
  readonly documentId: string
  ownerWebContentsId: number
  persistedRevision: number
  fingerprint: FileFingerprint
}

function mapFsFailure<T>(error: unknown, operation: string): ApiResult<T> {
  const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN'
  const mapped = code === 'EACCES' || code === 'EPERM'
    ? ['FS_PERMISSION_DENIED', 'error.fsPermissionDenied', true] as const
    : code === 'ENOSPC'
      ? ['FS_DISK_FULL', 'error.fsDiskFull', true] as const
      : code === 'ENOENT'
        ? ['FS_NOT_FOUND', 'error.fsNotFound', true] as const
        : ['FS_OPERATION_FAILED', 'error.fsOperationFailed', true] as const
  return failure(mapped[0], 'filesystem', mapped[1], mapped[2], { operation, systemCode: code }) as ApiResult<T>
}

export class FileService {
  readonly #selections: SelectionTokenStore
  readonly #files: FileCapabilityRegistry
  readonly #saveQueue = new PerDocumentSaveQueue()
  readonly #watch: WatchService
  readonly #runtime = new Map<string, RuntimeDocumentRecord>()
  readonly #recents: RecentDocumentStore
  readonly #resources: ResourceCapabilityBroker
  readonly #onSaved?: (documentId: string, throughRevision: number) => Promise<void>

  constructor(options: {
    selections: SelectionTokenStore
    files: FileCapabilityRegistry
    watch: WatchService
    recents: RecentDocumentStore
    resources: ResourceCapabilityBroker
    onSaved?: (documentId: string, throughRevision: number) => Promise<void>
  }) {
    this.#selections = options.selections
    this.#files = options.files
    this.#watch = options.watch
    this.#recents = options.recents
    this.#resources = options.resources
    this.#onSaved = options.onSaved
  }

  async openSelected(selectionToken: string, ownerWebContentsId: number, openedVia: OpenedVia = 'dialog'): Promise<ApiResult<OpenDocumentDTO>> {
    let selectedPath: string
    try {
      selectedPath = this.#selections.consume(selectionToken, 'document-open', ownerWebContentsId).path
      return await this.#openPath(selectedPath, ownerWebContentsId, openedVia)
    } catch (error) {
      return mapFsFailure(error, 'open')
    }
  }

  async reopenRecent(recentId: string, ownerWebContentsId: number): Promise<ApiResult<OpenDocumentDTO>> {
    const path = await this.#recents.resolve(recentId)
    if (!path) return failure('RECENT_NOT_FOUND', 'filesystem', 'error.recentNotFound', true)
    return this.reopenPath(path, ownerWebContentsId)
  }

  async reopenPath(path: string, ownerWebContentsId: number): Promise<ApiResult<OpenDocumentDTO>> {
    try { return await this.#openPath(path, ownerWebContentsId, 'recent') } catch (error) { return mapFsFailure(error, 'reopen') }
  }

  async #openPath(path: string, ownerWebContentsId: number, openedVia: OpenedVia): Promise<ApiResult<OpenDocumentDTO>> {
    const identity = await identifyExistingPath(path)
    const info = await stat(identity.canonicalPath)
    if (!info.isFile()) return failure('FS_NOT_FILE', 'filesystem', 'error.fsNotFile', true)
    const bytes = await readFile(identity.canonicalPath)
    const decoded = decodeDocumentBytes(bytes)
    const fingerprint = await fingerprintFile(identity.canonicalPath, true)
    let writable = true
    try { await access(identity.canonicalPath, constants.W_OK) } catch { writable = false }
    const documentId = randomUUID()
    this.#files.create({ documentId, ownerWebContentsId, path: identity, writable, openedVia })
    this.#runtime.set(documentId, { documentId, ownerWebContentsId, persistedRevision: 1, fingerprint })
    this.#watch.watchDocument(documentId, identity.canonicalPath)
    await this.#recents.add(path)
    return ok({
      documentId,
      displayPath: path,
      basename: basename(path),
      markdown: decoded.markdown,
      revision: 1,
      persistedRevision: 1,
      fingerprint,
      textFormat: decoded.textFormat,
      writable,
      resourceScopeId: this.#resources.bindDocument(documentId, ownerWebContentsId, dirname(identity.canonicalPath))
    })
  }

  async saveDocument(request: SaveDocumentRequest, ownerWebContentsId: number): Promise<ApiResult<SaveDocumentResult>> {
    return this.#saveQueue.enqueue(request.documentId, async () => {
      let capability
      try { capability = this.#files.get(request.documentId, ownerWebContentsId, 'write') } catch { return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false) }
      const runtime = this.#runtime.get(request.documentId)
      if (!runtime) return failure('DOC_NOT_OPEN', 'validation', 'error.documentNotOpen', true)
      if (request.revision < runtime.persistedRevision) return failure('DOC_STALE_SAVE_REVISION', 'conflict', 'error.staleSaveRevision', true)
      if (!request.expectedDiskFingerprint) {
        return failure('DOC_SAVE_PRECONDITION_REQUIRED', 'conflict', 'error.savePreconditionRequired', true)
      }
      try {
        const precondition = await fingerprintMatchesExpected(capability.path.canonicalPath, request.expectedDiskFingerprint)
        if (!precondition.matches) {
          return failure('DOC_EXTERNAL_CONFLICT', 'conflict', 'error.externalConflict', true, { documentId: request.documentId })
        }
        const bytes = encodeDocumentText(request.markdown, request.textFormat)
        const saveToken = randomUUID()
        this.#watch.recordExpectedWrite({
          documentId: request.documentId,
          canonicalPath: capability.path.canonicalPath,
          fingerprint: { size: bytes.length, mtimeMs: 0, sha256: createHash('sha256').update(bytes).digest('hex') },
          saveToken,
          expiresAt: Date.now() + 5_000
        })
        try {
          await atomicReplaceFile(capability.path.canonicalPath, bytes)
        } catch (error) {
          this.#watch.clearExpectedWrite(request.documentId)
          throw error
        }
        const fingerprint = await fingerprintFile(capability.path.canonicalPath, true)
        runtime.persistedRevision = Math.max(runtime.persistedRevision, request.revision)
        runtime.fingerprint = fingerprint
        this.#watch.recordExpectedWrite({ documentId: request.documentId, canonicalPath: capability.path.canonicalPath, fingerprint, saveToken, expiresAt: Date.now() + 5_000 })
        await this.#onSaved?.(request.documentId, request.revision)
        return ok({ documentId: request.documentId, savedRevision: request.revision, displayPath: capability.path.displayPath, fingerprint, textFormat: request.textFormat })
      } catch (error) {
        return mapFsFailure(error, 'save')
      }
    })
  }

  async saveDocumentAs(request: SaveDocumentAsRequest, ownerWebContentsId: number): Promise<ApiResult<SaveDocumentResult>> {
    return this.#saveQueue.enqueue(request.documentId, async () => {
      try {
        this.#files.get(request.documentId, ownerWebContentsId, 'read')
        const targetRecord = this.#selections.consume(request.targetSelectionToken, 'document-save', ownerWebContentsId)
        const targetPath = normalizeTargetPath(targetRecord.path)
        const bytes = encodeDocumentText(request.markdown, request.textFormat)
        await atomicReplaceFile(targetPath, bytes)
        const identity = await identifyExistingPath(targetPath)
        const fingerprint = await fingerprintFile(identity.canonicalPath, true)
        let writable = true
        try { await access(identity.canonicalPath, constants.W_OK) } catch { writable = false }
        // Identity is mutated only after the new target exists and verifies.
        this.#files.replacePath(request.documentId, ownerWebContentsId, identity, writable, 'dialog')
        const runtime = this.#runtime.get(request.documentId)
        if (runtime) {
          runtime.persistedRevision = Math.max(runtime.persistedRevision, request.revision)
          runtime.fingerprint = fingerprint
        }
        this.#watch.watchDocument(request.documentId, identity.canonicalPath)
        this.#watch.recordExpectedWrite({ documentId: request.documentId, canonicalPath: identity.canonicalPath, fingerprint, saveToken: randomUUID(), expiresAt: Date.now() + 5_000 })
        await this.#onSaved?.(request.documentId, request.revision)
        await this.#recents.add(targetRecord.path)
        const resourceScopeId = this.#resources.rebindDocument(request.documentId, ownerWebContentsId, dirname(identity.canonicalPath))
        return ok({ documentId: request.documentId, savedRevision: request.revision, displayPath: targetRecord.path, fingerprint, textFormat: request.textFormat, resourceScopeId })
      } catch (error) {
        return mapFsFailure(error, 'save-as')
      }
    })
  }

  async statDocument(documentId: string, ownerWebContentsId: number): Promise<ApiResult<DocumentStatDTO>> {
    try {
      const capability = this.#files.get(documentId, ownerWebContentsId, 'stat')
      const fingerprint = await fingerprintFile(capability.path.canonicalPath, false)
      return ok({ documentId, displayPath: capability.path.displayPath, fingerprint, writable: capability.permissions.has('write') })
    } catch (error) { return mapFsFailure(error, 'stat') }
  }

  async reloadDocument(documentId: string, ownerWebContentsId: number): Promise<ApiResult<OpenDocumentDTO>> {
    try {
      const capability = this.#files.get(documentId, ownerWebContentsId, 'read')
      const bytes = await readFile(capability.path.canonicalPath)
      const decoded = decodeDocumentBytes(bytes)
      const fingerprint = await fingerprintFile(capability.path.canonicalPath, true)
      const runtime = this.#runtime.get(documentId)
      const revision = (runtime?.persistedRevision ?? 1) + 1
      // Reading the current disk version does not mutate persisted state. The
      // renderer applies this DTO only after the user chooses Reload.
      return ok({
        documentId,
        displayPath: capability.path.displayPath,
        basename: basename(capability.path.displayPath),
        markdown: decoded.markdown,
        revision,
        persistedRevision: revision,
        fingerprint,
        textFormat: decoded.textFormat,
        writable: capability.permissions.has('write'),
        resourceScopeId: this.#resources.scopeForDocument(documentId, ownerWebContentsId) ?? this.#resources.bindDocument(documentId, ownerWebContentsId, dirname(capability.path.canonicalPath))
      })
    } catch (error) { return mapFsFailure(error, 'reload') }
  }

  async revealDocument(documentId: string, ownerWebContentsId: number): Promise<ApiResult<void>> {
    try {
      const capability = this.#files.get(documentId, ownerWebContentsId, 'reveal')
      shell.showItemInFolder(capability.path.canonicalPath)
      return ok(undefined)
    } catch (error) { return mapFsFailure(error, 'reveal') }
  }

  async trashDocument(documentId: string, ownerWebContentsId: number): Promise<ApiResult<void>> {
    try {
      const capability = this.#files.get(documentId, ownerWebContentsId, 'trash')
      await shell.trashItem(capability.path.canonicalPath)
      this.#watch.unwatchDocument(documentId)
      this.#resources.revokeDocument(documentId)
      this.#files.revoke(documentId)
      this.#runtime.delete(documentId)
      return ok(undefined)
    } catch (error) { return mapFsFailure(error, 'trash') }
  }

  async renameDocument(documentId: string, newBasename: string, ownerWebContentsId: number): Promise<ApiResult<FileMutationResult>> {
    if (!newBasename || basename(newBasename) !== newBasename || newBasename === '.' || newBasename === '..') {
      return failure('FS_INVALID_NAME', 'validation', 'error.invalidFileName', true)
    }
    try {
      const capability = this.#files.get(documentId, ownerWebContentsId, 'rename')
      const target = join(dirname(capability.path.canonicalPath), newBasename)
      await rename(capability.path.canonicalPath, target)
      const identity = await identifyExistingPath(target)
      this.#files.replacePath(documentId, ownerWebContentsId, identity, capability.permissions.has('write'), capability.openedVia)
      this.#watch.watchDocument(documentId, identity.canonicalPath)
      this.#resources.rebindDocument(documentId, ownerWebContentsId, dirname(identity.canonicalPath))
      return ok({ displayPath: target })
    } catch (error) { return mapFsFailure(error, 'rename') }
  }
}
