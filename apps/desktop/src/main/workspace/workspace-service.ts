import { createHash } from 'node:crypto'
import { mkdir, open, readdir, rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { shell } from 'electron'
import type {
  ApiResult,
  FileMutationResult,
  OpenDocumentDTO,
  RecentItemDTO,
  SearchRequest,
  WorkspaceDTO,
  WorkspaceEntry
} from '@markhere/ipc-contract'
import { failure, ok } from '../services/api-results'
import type { SelectionTokenStore } from '../services/selection-token-store'
import type { RecentDocumentStore } from '../storage/recent-document-store'
import type { FileService } from '../documents/file-service'
import { identifyExistingPath } from '../documents/path-identity'
import { WorkspaceCapabilityRegistry } from './workspace-capability-registry'
import { WorkspaceWatchService } from './workspace-watch-service'
import { WorkspaceSearchService } from './workspace-search-service'
import {
  assertWorkspaceDirectory,
  resolveExistingWorkspacePath,
  resolveWorkspaceTarget,
  validateWorkspaceBasename,
  validateWorkspaceRelativePath,
  workspaceRelativePath
} from './workspace-path'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mmd', '.mdown', '.mdtext', '.mdtxt'])

function workspaceError<T>(error: unknown, operation: string): ApiResult<T> {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EEXIST') return failure('WS_ALREADY_EXISTS', 'workspace', 'error.workspaceAlreadyExists', true, { operation }) as ApiResult<T>
  if (code === 'ENOENT') return failure('WS_NOT_FOUND', 'workspace', 'error.workspaceNotFound', true, { operation }) as ApiResult<T>
  if (code === 'EACCES' || code === 'EPERM') return failure('WS_PERMISSION_DENIED', 'workspace', 'error.workspacePermissionDenied', true, { operation }) as ApiResult<T>
  return failure('WS_OPERATION_FAILED', 'workspace', 'error.workspaceOperationFailed', true, { operation }) as ApiResult<T>
}

function entryId(workspaceId: string, relativePath: string): string {
  return createHash('sha256').update(`${workspaceId}:${relativePath.normalize('NFC')}`).digest('hex').slice(0, 24)
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLocaleLowerCase('en-US') : ''
}

export class WorkspaceService {
  readonly #selections: SelectionTokenStore
  readonly #capabilities: WorkspaceCapabilityRegistry
  readonly #files: FileService
  readonly #recents: RecentDocumentStore
  readonly #watch: WorkspaceWatchService
  readonly #search: WorkspaceSearchService

  constructor(options: {
    selections: SelectionTokenStore
    capabilities: WorkspaceCapabilityRegistry
    files: FileService
    recents: RecentDocumentStore
    watch: WorkspaceWatchService
    search: WorkspaceSearchService
  }) {
    this.#selections = options.selections
    this.#capabilities = options.capabilities
    this.#files = options.files
    this.#recents = options.recents
    this.#watch = options.watch
    this.#search = options.search
  }

  async openSelected(selectionToken: string, ownerWebContentsId: number): Promise<ApiResult<WorkspaceDTO>> {
    try {
      const selected = this.#selections.consume(selectionToken, 'workspace-open', ownerWebContentsId)
      return await this.#openPath(selected.path, ownerWebContentsId)
    } catch (error) { return workspaceError(error, 'open') }
  }

  async reopenRecent(recentId: string, ownerWebContentsId: number): Promise<ApiResult<WorkspaceDTO>> {
    const path = await this.#recents.resolveWorkspace(recentId)
    if (!path) return failure('RECENT_WORKSPACE_NOT_FOUND', 'workspace', 'error.recentWorkspaceNotFound', true)
    try { return await this.#openPath(path, ownerWebContentsId) } catch (error) { return workspaceError(error, 'reopen') }
  }

  async #openPath(path: string, ownerWebContentsId: number): Promise<ApiResult<WorkspaceDTO>> {
    const identity = await identifyExistingPath(path)
    await assertWorkspaceDirectory(identity.canonicalPath)
    const record = this.#capabilities.create({ ownerWebContentsId, displayPath: path, canonicalRoot: identity.canonicalPath })
    this.#watch.watch(record.workspaceId, ownerWebContentsId, record.canonicalRoot)
    await this.#recents.addWorkspace(path)
    return ok({ workspaceId: record.workspaceId, displayPath: path, basename: basename(path) || path })
  }

  async close(workspaceId: string, ownerWebContentsId: number): Promise<ApiResult<void>> {
    try {
      this.#capabilities.get(workspaceId, ownerWebContentsId)
      this.#search.cancelWorkspace(workspaceId, ownerWebContentsId)
      await this.#watch.unwatch(workspaceId)
      this.#capabilities.revoke(workspaceId)
      return ok(undefined)
    } catch (error) { return workspaceError(error, 'close') }
  }

  async list(workspaceId: string, relativePath: string | undefined, ownerWebContentsId: number): Promise<ApiResult<WorkspaceEntry[]>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      const directory = await resolveExistingWorkspacePath(record.canonicalRoot, relativePath ?? '')
      await assertWorkspaceDirectory(directory)
      const children = await readdir(directory, { withFileTypes: true })
      const entries: WorkspaceEntry[] = children.map((item) => {
        const relativePathValue = workspaceRelativePath(record.canonicalRoot, join(directory, item.name))
        const kind: WorkspaceEntry['kind'] = item.isDirectory() ? 'directory' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'symlink' : 'other'
        return {
          id: entryId(workspaceId, relativePathValue),
          name: item.name,
          relativePath: relativePathValue,
          kind,
          markdown: kind === 'file' && MARKDOWN_EXTENSIONS.has(extensionOf(item.name)),
          childrenLoaded: false
        }
      })
      entries.sort((a, b) => (a.kind === 'directory' ? 0 : 1) - (b.kind === 'directory' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      return ok(entries)
    } catch (error) { return workspaceError(error, 'list') }
  }

  async createFile(workspaceId: string, relativePath: string, ownerWebContentsId: number): Promise<ApiResult<FileMutationResult>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      const target = await resolveWorkspaceTarget(record.canonicalRoot, relativePath)
      const handle = await open(target, 'wx')
      await handle.close()
      return ok({ displayPath: target })
    } catch (error) { return workspaceError(error, 'createFile') }
  }

  async createDirectory(workspaceId: string, relativePath: string, ownerWebContentsId: number): Promise<ApiResult<FileMutationResult>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      const target = await resolveWorkspaceTarget(record.canonicalRoot, relativePath)
      await mkdir(target)
      return ok({ displayPath: target })
    } catch (error) { return workspaceError(error, 'createDirectory') }
  }

  async rename(workspaceId: string, relativePath: string, newName: string, ownerWebContentsId: number): Promise<ApiResult<FileMutationResult>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      if (!validateWorkspaceRelativePath(relativePath)) return failure('WS_ROOT_MUTATION_BLOCKED', 'workspace', 'error.workspaceRootMutationBlocked', true)
      const source = await resolveExistingWorkspacePath(record.canonicalRoot, relativePath)
      const targetRelative = [dirname(relativePath).replace(/\\/g, '/'), validateWorkspaceBasename(newName)].filter((part) => part && part !== '.').join('/')
      const target = await resolveWorkspaceTarget(record.canonicalRoot, targetRelative)
      await rename(source, target)
      return ok({ displayPath: target })
    } catch (error) { return workspaceError(error, 'rename') }
  }

  async move(workspaceId: string, relativePath: string, targetRelativePath: string, ownerWebContentsId: number): Promise<ApiResult<FileMutationResult>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      if (!validateWorkspaceRelativePath(relativePath)) return failure('WS_ROOT_MUTATION_BLOCKED', 'workspace', 'error.workspaceRootMutationBlocked', true)
      const source = await resolveExistingWorkspacePath(record.canonicalRoot, relativePath)
      const target = await resolveWorkspaceTarget(record.canonicalRoot, targetRelativePath)
      await rename(source, target)
      return ok({ displayPath: target })
    } catch (error) { return workspaceError(error, 'move') }
  }

  async trash(workspaceId: string, relativePath: string, ownerWebContentsId: number): Promise<ApiResult<void>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      const target = await resolveExistingWorkspacePath(record.canonicalRoot, relativePath)
      if (target === record.canonicalRoot) return failure('WS_ROOT_MUTATION_BLOCKED', 'workspace', 'error.workspaceRootMutationBlocked', true)
      await shell.trashItem(target)
      return ok(undefined)
    } catch (error) { return workspaceError(error, 'trash') }
  }

  async openEntry(workspaceId: string, relativePath: string, ownerWebContentsId: number): Promise<ApiResult<OpenDocumentDTO>> {
    try {
      const record = this.#capabilities.get(workspaceId, ownerWebContentsId)
      const target = await resolveExistingWorkspacePath(record.canonicalRoot, relativePath)
      const info = await stat(target)
      if (!info.isFile()) return failure('WS_NOT_FILE', 'workspace', 'error.workspaceNotFile', true)
      return await this.#files.openWorkspacePath(target, ownerWebContentsId)
    } catch (error) { return workspaceError(error, 'openEntry') }
  }

  search(request: SearchRequest, ownerWebContentsId: number): ApiResult<{ searchId: string }> {
    try {
      const record = this.#capabilities.get(request.workspaceId, ownerWebContentsId)
      return ok({ searchId: this.#search.start(record.canonicalRoot, ownerWebContentsId, request) })
    } catch (error) { return workspaceError(error, 'search') }
  }

  cancelSearch(searchId: string, ownerWebContentsId: number): void { this.#search.cancel(searchId, ownerWebContentsId) }
  listRecent(): Promise<RecentItemDTO[]> { return this.#recents.listWorkspaces() }
  async removeRecent(recentId: string): Promise<void> { await this.#recents.remove(recentId, 'workspace') }
  async clearRecent(): Promise<void> { await this.#recents.clear('workspace') }

  async revokeAllForWebContents(ownerWebContentsId: number): Promise<void> {
    for (const workspaceId of this.#capabilities.revokeAllForWebContents(ownerWebContentsId)) {
      this.#search.cancelWorkspace(workspaceId, ownerWebContentsId)
      await this.#watch.unwatch(workspaceId)
    }
  }
}
