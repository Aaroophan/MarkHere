import type { AppInfo, PlatformInfo } from './dto/app'
import type { ClipboardImageDTO, RichClipboardRequest } from './dto/clipboard'
import type {
  ApiResult,
  SelectedPath,
  SettingsSection,
  Unsubscribe
} from './dto/common'
import type {
  ConfirmDialogRequest,
  ConfirmDialogResult,
  ExportTargetDialogRequest,
  OpenDocumentDialogOptions
} from './dto/dialogs'
import type {
  AppCommandEvent,
  DocumentExternalChangeEvent,
  ExportCompletedEvent,
  ExportProgressEvent,
  UpdateStatus,
  WindowStateEvent,
  WorkspaceChangeEvent
} from './dto/events'
import type {
  DocumentStatDTO,
  FileMutationResult,
  ImportedImageResult,
  OpenDocumentDTO,
  RenameDocumentRequest,
  CopyImportedImageRequest,
  SaveDocumentAsRequest,
  SaveDocumentRequest,
  SaveDocumentResult
} from './dto/files'
import type {
  ExportJobDTO,
  ExportFormat,
  StartExportRequest
} from './dto/export'
import type {
  ImportLocalImageRequest,
  ResolveDocumentLinkRequest,
  ResolvedDocumentLink
} from './dto/resources'
import type {
  RecoveryDocumentDTO,
  RecoverySummary,
  RecoveryUpdateRequest,
  RecoveryUpdateResult
} from './dto/recovery'
import type {
  KeybindingConfig,
  MarkHereSettings,
  SettingsPatch
} from './dto/settings'
import type { UpdateStatus as UpdateStatusDTO } from './dto/update'
import type {
  CreateWorkspaceDirectoryRequest,
  CreateWorkspaceFileRequest,
  ListWorkspaceRequest,
  MoveWorkspaceEntryRequest,
  OpenWorkspaceEntryRequest,
  RenameWorkspaceEntryRequest,
  SearchRequest,
  TrashWorkspaceEntryRequest,
  WorkspaceDTO,
  WorkspaceEntry
} from './dto/workspace'

export interface AppApi {
  getInfo(): Promise<ApiResult<AppInfo>>
  getPlatformInfo(): Promise<ApiResult<PlatformInfo>>
  requestQuit(): Promise<ApiResult<void>>
  openAbout(): Promise<ApiResult<void>>
  openSettings(section?: SettingsSection): Promise<ApiResult<void>>
}

export interface WindowApi {
  minimize(): void
  toggleMaximize(): void
  close(): void
  toggleFullScreen(): void
  isMaximized(): Promise<ApiResult<boolean>>
  isFullScreen(): Promise<ApiResult<boolean>>
  setAlwaysOnTop(enabled: boolean): Promise<ApiResult<void>>
}

export interface DialogApi {
  openDocuments(options?: OpenDocumentDialogOptions): Promise<ApiResult<SelectedPath[]>>
  openWorkspace(): Promise<ApiResult<SelectedPath | null>>
  chooseSaveDocument(defaultName?: string): Promise<ApiResult<SelectedPath | null>>
  chooseExportTarget(request: ExportTargetDialogRequest): Promise<ApiResult<SelectedPath | null>>
  confirm(request: ConfirmDialogRequest): Promise<ApiResult<ConfirmDialogResult>>
}

export interface FileApi {
  openSelected(selectionToken: string): Promise<ApiResult<OpenDocumentDTO>>
  reopenRecent(recentId: string): Promise<ApiResult<OpenDocumentDTO>>
  saveDocument(request: SaveDocumentRequest): Promise<ApiResult<SaveDocumentResult>>
  saveDocumentAs(request: SaveDocumentAsRequest): Promise<ApiResult<SaveDocumentResult>>
  statDocument(documentId: string): Promise<ApiResult<DocumentStatDTO>>
  reloadDocument(documentId: string): Promise<ApiResult<OpenDocumentDTO>>
  revealDocument(documentId: string): Promise<ApiResult<void>>
  trashDocument(documentId: string): Promise<ApiResult<void>>
  renameDocument(request: RenameDocumentRequest): Promise<ApiResult<FileMutationResult>>
  copyImportedImage(request: CopyImportedImageRequest): Promise<ApiResult<ImportedImageResult>>
}

export interface WorkspaceApi {
  open(selectionToken: string): Promise<ApiResult<WorkspaceDTO>>
  close(workspaceId: string): Promise<ApiResult<void>>
  list(request: ListWorkspaceRequest): Promise<ApiResult<WorkspaceEntry[]>>
  createFile(request: CreateWorkspaceFileRequest): Promise<ApiResult<FileMutationResult>>
  createDirectory(request: CreateWorkspaceDirectoryRequest): Promise<ApiResult<FileMutationResult>>
  rename(request: RenameWorkspaceEntryRequest): Promise<ApiResult<FileMutationResult>>
  move(request: MoveWorkspaceEntryRequest): Promise<ApiResult<FileMutationResult>>
  trash(request: TrashWorkspaceEntryRequest): Promise<ApiResult<void>>
  openEntry(request: OpenWorkspaceEntryRequest): Promise<ApiResult<OpenDocumentDTO>>
  search(request: SearchRequest): Promise<ApiResult<{ searchId: string }>>
  cancelSearch(searchId: string): void
}

export interface ResourceApi {
  resolveLink(request: ResolveDocumentLinkRequest): Promise<ApiResult<ResolvedDocumentLink>>
  importLocalImage(request: ImportLocalImageRequest): Promise<ApiResult<ImportedImageResult>>
  invalidateDocumentCache(documentId: string): void
}

export interface SettingsApi {
  get(): Promise<ApiResult<MarkHereSettings>>
  update(patch: SettingsPatch): Promise<ApiResult<MarkHereSettings>>
  reset(section?: SettingsSection): Promise<ApiResult<MarkHereSettings>>
  getKeybindings(): Promise<ApiResult<KeybindingConfig>>
  updateKeybindings(config: KeybindingConfig): Promise<ApiResult<KeybindingConfig>>
}

export interface RecoveryApi {
  updateSnapshot(request: RecoveryUpdateRequest): Promise<ApiResult<RecoveryUpdateResult>>
  listRecoverable(): Promise<ApiResult<RecoverySummary[]>>
  getSnapshot(snapshotId: string): Promise<ApiResult<RecoveryDocumentDTO>>
  discard(snapshotId: string): Promise<ApiResult<void>>
  discardForDocument(documentId: string, throughRevision?: number): Promise<ApiResult<void>>
}

export interface ExportApi {
  start(request: StartExportRequest): Promise<ApiResult<{ jobId: string }>>
  cancel(jobId: string): void
  getStatus(jobId: string): Promise<ApiResult<ExportJobDTO>>
}

export interface ShellApi {
  openExternal(url: string): Promise<ApiResult<void>>
  showItemInFolder(documentId: string): Promise<ApiResult<void>>
}

export interface ClipboardApi {
  readImageForImport(): Promise<ApiResult<ClipboardImageDTO | null>>
  writeText(text: string): Promise<ApiResult<void>>
  writeRich(request: RichClipboardRequest): Promise<ApiResult<void>>
}

export interface UpdateApi {
  check(): Promise<ApiResult<UpdateStatusDTO>>
  download(): Promise<ApiResult<void>>
  installAndRestart(): Promise<ApiResult<void>>
  getStatus(): Promise<ApiResult<UpdateStatusDTO>>
}

export interface EventApi {
  onDocumentExternalChange(cb: (event: DocumentExternalChangeEvent) => void): Unsubscribe
  onWorkspaceChange(cb: (event: WorkspaceChangeEvent) => void): Unsubscribe
  onExportProgress(cb: (event: ExportProgressEvent) => void): Unsubscribe
  onExportCompleted(cb: (event: ExportCompletedEvent) => void): Unsubscribe
  onUpdateStatus(cb: (event: UpdateStatus) => void): Unsubscribe
  onAppCommand(cb: (event: AppCommandEvent) => void): Unsubscribe
  onWindowState(cb: (event: WindowStateEvent) => void): Unsubscribe
}

export interface MarkHereDesktopApi {
  readonly version: 1
  readonly app: AppApi
  readonly window: WindowApi
  readonly dialogs: DialogApi
  readonly files: FileApi
  readonly workspaces: WorkspaceApi
  readonly resources: ResourceApi
  readonly settings: SettingsApi
  readonly recovery: RecoveryApi
  readonly exports: ExportApi
  readonly shell: ShellApi
  readonly clipboard: ClipboardApi
  readonly updates: UpdateApi
  readonly events: EventApi
}

export type { ExportFormat }
