import type { ApiResult, SelectedPath, SettingsSection } from './dto/common'
import type { AppInfo, PlatformInfo } from './dto/app'
import type { ClipboardImageDTO, RichClipboardRequest } from './dto/clipboard'
import type {
  ConfirmDialogRequest,
  ConfirmDialogResult,
  ExportTargetDialogRequest,
  OpenDocumentDialogOptions
} from './dto/dialogs'
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
import type { ExportJobDTO, StartExportRequest } from './dto/export'
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
import type { KeybindingConfig, MarkHereSettings, SettingsPatch } from './dto/settings'
import type { UpdateStatus } from './dto/update'
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
import type {
  AppCommandEvent,
  DocumentExternalChangeEvent,
  ExportCompletedEvent,
  ExportProgressEvent,
  WindowStateEvent,
  WorkspaceChangeEvent
} from './dto/events'

export const CHANNELS = Object.freeze({
  appGetInfo: 'mh:v1:app:get-info',
  appGetPlatformInfo: 'mh:v1:app:get-platform-info',
  appRequestQuit: 'mh:v1:app:request-quit',
  appOpenAbout: 'mh:v1:app:open-about',
  appOpenSettings: 'mh:v1:app:open-settings',
  windowMinimize: 'mh:v1:window:minimize',
  windowToggleMaximize: 'mh:v1:window:toggle-maximize',
  windowClose: 'mh:v1:window:close',
  windowToggleFullScreen: 'mh:v1:window:toggle-fullscreen',
  windowIsMaximized: 'mh:v1:window:is-maximized',
  windowIsFullScreen: 'mh:v1:window:is-fullscreen',
  windowSetAlwaysOnTop: 'mh:v1:window:set-always-on-top',
  dialogsOpenDocuments: 'mh:v1:dialogs:open-documents',
  dialogsOpenWorkspace: 'mh:v1:dialogs:open-workspace',
  dialogsChooseSaveDocument: 'mh:v1:dialogs:choose-save-document',
  dialogsChooseExportTarget: 'mh:v1:dialogs:choose-export-target',
  dialogsConfirm: 'mh:v1:dialogs:confirm',
  fileOpenSelected: 'mh:v1:file:open-selected',
  fileReopenRecent: 'mh:v1:file:reopen-recent',
  fileSave: 'mh:v1:file:save',
  fileSaveAs: 'mh:v1:file:save-as',
  fileStat: 'mh:v1:file:stat',
  fileReload: 'mh:v1:file:reload',
  fileReveal: 'mh:v1:file:reveal',
  fileTrash: 'mh:v1:file:trash',
  fileRename: 'mh:v1:file:rename',
  fileCopyImportedImage: 'mh:v1:file:copy-imported-image',
  workspaceOpen: 'mh:v1:workspace:open',
  workspaceClose: 'mh:v1:workspace:close',
  workspaceList: 'mh:v1:workspace:list',
  workspaceCreateFile: 'mh:v1:workspace:create-file',
  workspaceCreateDirectory: 'mh:v1:workspace:create-directory',
  workspaceRename: 'mh:v1:workspace:rename',
  workspaceMove: 'mh:v1:workspace:move',
  workspaceTrash: 'mh:v1:workspace:trash',
  workspaceOpenEntry: 'mh:v1:workspace:open-entry',
  workspaceSearch: 'mh:v1:workspace:search',
  workspaceCancelSearch: 'mh:v1:workspace:cancel-search',
  resourceResolveLink: 'mh:v1:resource:resolve-link',
  resourceImportLocalImage: 'mh:v1:resource:import-local-image',
  resourceInvalidateDocumentCache: 'mh:v1:resource:invalidate-document-cache',
  settingsGet: 'mh:v1:settings:get',
  settingsUpdate: 'mh:v1:settings:update',
  settingsReset: 'mh:v1:settings:reset',
  settingsGetKeybindings: 'mh:v1:settings:get-keybindings',
  settingsUpdateKeybindings: 'mh:v1:settings:update-keybindings',
  recoveryUpdate: 'mh:v1:recovery:update',
  recoveryList: 'mh:v1:recovery:list',
  recoveryGet: 'mh:v1:recovery:get',
  recoveryDiscard: 'mh:v1:recovery:discard',
  recoveryDiscardForDocument: 'mh:v1:recovery:discard-for-document',
  exportStart: 'mh:v1:export:start',
  exportCancel: 'mh:v1:export:cancel',
  exportGetStatus: 'mh:v1:export:get-status',
  shellOpenExternal: 'mh:v1:shell:open-external',
  shellShowItemInFolder: 'mh:v1:shell:show-item-in-folder',
  clipboardReadImageForImport: 'mh:v1:clipboard:read-image-for-import',
  clipboardWriteText: 'mh:v1:clipboard:write-text',
  clipboardWriteRich: 'mh:v1:clipboard:write-rich',
  updateCheck: 'mh:v1:update:check',
  updateDownload: 'mh:v1:update:download',
  updateInstallAndRestart: 'mh:v1:update:install-and-restart',
  updateGetStatus: 'mh:v1:update:get-status',
  eventDocumentExternalChange: 'mh:v1:event:document-external-change',
  eventWorkspaceChange: 'mh:v1:event:workspace-change',
  eventExportProgress: 'mh:v1:event:export-progress',
  eventExportCompleted: 'mh:v1:event:export-completed',
  eventUpdateStatus: 'mh:v1:event:update-status',
  eventAppCommand: 'mh:v1:event:app-command',
  eventWindowState: 'mh:v1:event:window-state'
} as const)

export interface InvokeChannelMap {
  [CHANNELS.appGetInfo]: { args: []; result: ApiResult<AppInfo> }
  [CHANNELS.appGetPlatformInfo]: { args: []; result: ApiResult<PlatformInfo> }
  [CHANNELS.appRequestQuit]: { args: []; result: ApiResult<void> }
  [CHANNELS.appOpenAbout]: { args: []; result: ApiResult<void> }
  [CHANNELS.appOpenSettings]: { args: [section?: SettingsSection]; result: ApiResult<void> }
  [CHANNELS.windowIsMaximized]: { args: []; result: ApiResult<boolean> }
  [CHANNELS.windowIsFullScreen]: { args: []; result: ApiResult<boolean> }
  [CHANNELS.windowSetAlwaysOnTop]: { args: [enabled: boolean]; result: ApiResult<void> }
  [CHANNELS.dialogsOpenDocuments]: {
    args: [options?: OpenDocumentDialogOptions]
    result: ApiResult<SelectedPath[]>
  }
  [CHANNELS.dialogsOpenWorkspace]: { args: []; result: ApiResult<SelectedPath | null> }
  [CHANNELS.dialogsChooseSaveDocument]: {
    args: [defaultName?: string]
    result: ApiResult<SelectedPath | null>
  }
  [CHANNELS.dialogsChooseExportTarget]: {
    args: [request: ExportTargetDialogRequest]
    result: ApiResult<SelectedPath | null>
  }
  [CHANNELS.dialogsConfirm]: {
    args: [request: ConfirmDialogRequest]
    result: ApiResult<ConfirmDialogResult>
  }
  [CHANNELS.fileOpenSelected]: { args: [selectionToken: string]; result: ApiResult<OpenDocumentDTO> }
  [CHANNELS.fileReopenRecent]: { args: [recentId: string]; result: ApiResult<OpenDocumentDTO> }
  [CHANNELS.fileSave]: { args: [request: SaveDocumentRequest]; result: ApiResult<SaveDocumentResult> }
  [CHANNELS.fileSaveAs]: { args: [request: SaveDocumentAsRequest]; result: ApiResult<SaveDocumentResult> }
  [CHANNELS.fileStat]: { args: [documentId: string]; result: ApiResult<DocumentStatDTO> }
  [CHANNELS.fileReload]: { args: [documentId: string]; result: ApiResult<OpenDocumentDTO> }
  [CHANNELS.fileReveal]: { args: [documentId: string]; result: ApiResult<void> }
  [CHANNELS.fileTrash]: { args: [documentId: string]; result: ApiResult<void> }
  [CHANNELS.fileRename]: { args: [request: RenameDocumentRequest]; result: ApiResult<FileMutationResult> }
  [CHANNELS.fileCopyImportedImage]: { args: [request: CopyImportedImageRequest]; result: ApiResult<ImportedImageResult> }
  [CHANNELS.workspaceOpen]: { args: [selectionToken: string]; result: ApiResult<WorkspaceDTO> }
  [CHANNELS.workspaceClose]: { args: [workspaceId: string]; result: ApiResult<void> }
  [CHANNELS.workspaceList]: { args: [request: ListWorkspaceRequest]; result: ApiResult<WorkspaceEntry[]> }
  [CHANNELS.workspaceCreateFile]: { args: [request: CreateWorkspaceFileRequest]; result: ApiResult<FileMutationResult> }
  [CHANNELS.workspaceCreateDirectory]: { args: [request: CreateWorkspaceDirectoryRequest]; result: ApiResult<FileMutationResult> }
  [CHANNELS.workspaceRename]: { args: [request: RenameWorkspaceEntryRequest]; result: ApiResult<FileMutationResult> }
  [CHANNELS.workspaceMove]: { args: [request: MoveWorkspaceEntryRequest]; result: ApiResult<FileMutationResult> }
  [CHANNELS.workspaceTrash]: { args: [request: TrashWorkspaceEntryRequest]; result: ApiResult<void> }
  [CHANNELS.workspaceOpenEntry]: { args: [request: OpenWorkspaceEntryRequest]; result: ApiResult<OpenDocumentDTO> }
  [CHANNELS.workspaceSearch]: { args: [request: SearchRequest]; result: ApiResult<{ searchId: string }> }
  [CHANNELS.resourceResolveLink]: { args: [request: ResolveDocumentLinkRequest]; result: ApiResult<ResolvedDocumentLink> }
  [CHANNELS.resourceImportLocalImage]: { args: [request: ImportLocalImageRequest]; result: ApiResult<ImportedImageResult> }
  [CHANNELS.settingsGet]: { args: []; result: ApiResult<MarkHereSettings> }
  [CHANNELS.settingsUpdate]: { args: [patch: SettingsPatch]; result: ApiResult<MarkHereSettings> }
  [CHANNELS.settingsReset]: { args: [section?: SettingsSection]; result: ApiResult<MarkHereSettings> }
  [CHANNELS.settingsGetKeybindings]: { args: []; result: ApiResult<KeybindingConfig> }
  [CHANNELS.settingsUpdateKeybindings]: { args: [config: KeybindingConfig]; result: ApiResult<KeybindingConfig> }
  [CHANNELS.recoveryUpdate]: { args: [request: RecoveryUpdateRequest]; result: ApiResult<RecoveryUpdateResult> }
  [CHANNELS.recoveryList]: { args: []; result: ApiResult<RecoverySummary[]> }
  [CHANNELS.recoveryGet]: { args: [snapshotId: string]; result: ApiResult<RecoveryDocumentDTO> }
  [CHANNELS.recoveryDiscard]: { args: [snapshotId: string]; result: ApiResult<void> }
  [CHANNELS.recoveryDiscardForDocument]: {
    args: [documentId: string, throughRevision?: number]
    result: ApiResult<void>
  }
  [CHANNELS.exportStart]: { args: [request: StartExportRequest]; result: ApiResult<{ jobId: string }> }
  [CHANNELS.exportGetStatus]: { args: [jobId: string]; result: ApiResult<ExportJobDTO> }
  [CHANNELS.shellOpenExternal]: { args: [url: string]; result: ApiResult<void> }
  [CHANNELS.shellShowItemInFolder]: { args: [documentId: string]; result: ApiResult<void> }
  [CHANNELS.clipboardReadImageForImport]: { args: []; result: ApiResult<ClipboardImageDTO | null> }
  [CHANNELS.clipboardWriteText]: { args: [text: string]; result: ApiResult<void> }
  [CHANNELS.clipboardWriteRich]: { args: [request: RichClipboardRequest]; result: ApiResult<void> }
  [CHANNELS.updateCheck]: { args: []; result: ApiResult<UpdateStatus> }
  [CHANNELS.updateDownload]: { args: []; result: ApiResult<void> }
  [CHANNELS.updateInstallAndRestart]: { args: []; result: ApiResult<void> }
  [CHANNELS.updateGetStatus]: { args: []; result: ApiResult<UpdateStatus> }
}

export interface SendChannelMap {
  [CHANNELS.windowMinimize]: []
  [CHANNELS.windowToggleMaximize]: []
  [CHANNELS.windowClose]: []
  [CHANNELS.windowToggleFullScreen]: []
  [CHANNELS.workspaceCancelSearch]: [searchId: string]
  [CHANNELS.resourceInvalidateDocumentCache]: [documentId: string]
  [CHANNELS.exportCancel]: [jobId: string]
}

export interface MainEventChannelMap {
  [CHANNELS.eventDocumentExternalChange]: DocumentExternalChangeEvent
  [CHANNELS.eventWorkspaceChange]: WorkspaceChangeEvent
  [CHANNELS.eventExportProgress]: ExportProgressEvent
  [CHANNELS.eventExportCompleted]: ExportCompletedEvent
  [CHANNELS.eventUpdateStatus]: UpdateStatus
  [CHANNELS.eventAppCommand]: AppCommandEvent
  [CHANNELS.eventWindowState]: WindowStateEvent
}

export type InvokeChannel = keyof InvokeChannelMap
export type SendChannel = keyof SendChannelMap
export type MainEventChannel = keyof MainEventChannelMap
