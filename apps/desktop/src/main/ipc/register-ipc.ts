import type { BrowserWindow } from 'electron'
import {
  CHANNELS,
  type ApiResult,
  type OpenDocumentDTO,
  type SaveDocumentResult,
  type DocumentStatDTO,
  type FileMutationResult,
  type ImportedImageResult,
  type WorkspaceDTO,
  type WorkspaceEntry,
  type ResolvedDocumentLink,
  type MarkHereSettings,
  type KeybindingConfig,
  type RecoveryUpdateResult,
  type RecoverySummary,
  type RecoveryDocumentDTO,
  type ExportJobDTO,
  type UpdateStatus
} from '@markhere/ipc-contract'
import type { TrustedWebContentsRegistry } from '../security/trusted-web-contents-registry'
import type { CapabilityOwnershipRegistry, CapabilityKind } from '../security/capability-ownership-registry'
import type { AppService } from '../services/app-service'
import type { WindowService } from '../services/window-service'
import type { DialogService } from '../services/dialog-service'
import type { ShellService } from '../services/shell-service'
import type { ClipboardService } from '../services/clipboard-service'
import type { FutureService } from '../services/future-service'
import type { FileService } from '../documents/file-service'
import type { RecoveryService } from '../storage/recovery-service'
import type { ResourceService } from '../resources/resource-service'
import type { SelectionTokenKind, SelectionTokenStore } from '../services/selection-token-store'
import { failure } from '../services/api-results'
import { registerValidatedInvoke, registerValidatedSend } from './validated-ipc'

export interface IpcServices {
  readonly trusted: TrustedWebContentsRegistry
  readonly capabilities: CapabilityOwnershipRegistry
  readonly selections: SelectionTokenStore
  readonly app: AppService
  readonly window: WindowService
  readonly dialogs: DialogService
  readonly shell: ShellService
  readonly clipboard: ClipboardService
  readonly files: FileService
  readonly resources: ResourceService
  readonly recovery: RecoveryService
  readonly future: FutureService
}

function ownedOrFailure<T>(
  capabilities: CapabilityOwnershipRegistry,
  capabilityId: string,
  kind: CapabilityKind,
  ownerWebContentsId: number
): ApiResult<T> | null {
  if (capabilities.owns(capabilityId, kind, ownerWebContentsId)) return null
  return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false, { kind }) as ApiResult<T>
}

function selectionOrFailure<T>(
  selections: SelectionTokenStore,
  token: string,
  kind: SelectionTokenKind,
  ownerWebContentsId: number
): ApiResult<T> | null {
  if (selections.owns(token, kind, ownerWebContentsId)) return null
  return failure('SEC_SELECTION_TOKEN_INVALID', 'security', 'error.selectionTokenInvalid', false) as ApiResult<T>
}

export function registerIpcHandlers(services: IpcServices): void {
  const { trusted, capabilities, selections } = services

  registerValidatedInvoke(trusted, CHANNELS.appGetInfo, () => services.app.getInfo())
  registerValidatedInvoke(trusted, CHANNELS.appGetPlatformInfo, () => services.app.getPlatformInfo())
  registerValidatedInvoke(trusted, CHANNELS.appRequestQuit, () => services.app.requestQuit())
  registerValidatedInvoke(trusted, CHANNELS.appOpenAbout, (event) => services.app.openAbout(event.sender))
  registerValidatedInvoke(trusted, CHANNELS.appOpenSettings, (_event, _sender, section) => services.app.openSettings(section))

  registerValidatedSend(trusted, CHANNELS.windowMinimize, (event) => services.window.minimize(event.sender))
  registerValidatedSend(trusted, CHANNELS.windowToggleMaximize, (event) => services.window.toggleMaximize(event.sender))
  registerValidatedSend(trusted, CHANNELS.windowClose, (event) => services.window.close(event.sender))
  registerValidatedSend(trusted, CHANNELS.windowToggleFullScreen, (event) => services.window.toggleFullScreen(event.sender))
  registerValidatedInvoke(trusted, CHANNELS.windowIsMaximized, (event) => services.window.isMaximized(event.sender))
  registerValidatedInvoke(trusted, CHANNELS.windowIsFullScreen, (event) => services.window.isFullScreen(event.sender))
  registerValidatedInvoke(trusted, CHANNELS.windowSetAlwaysOnTop, (event, _sender, enabled) => services.window.setAlwaysOnTop(event.sender, enabled))

  registerValidatedInvoke(trusted, CHANNELS.dialogsOpenDocuments, (event, _sender, options) => services.dialogs.openDocuments(event.sender, options))
  registerValidatedInvoke(trusted, CHANNELS.dialogsOpenWorkspace, (event) => services.dialogs.openWorkspace(event.sender))
  registerValidatedInvoke(trusted, CHANNELS.dialogsChooseSaveDocument, (event, _sender, defaultName) => services.dialogs.chooseSaveDocument(event.sender, defaultName))
  registerValidatedInvoke(trusted, CHANNELS.dialogsChooseExportTarget, (event, _sender, request) => services.dialogs.chooseExportTarget(event.sender, request))
  registerValidatedInvoke(trusted, CHANNELS.dialogsConfirm, (event, _sender, request) => services.dialogs.confirm(event.sender, request))

  registerValidatedInvoke(trusted, CHANNELS.fileOpenSelected, (_event, sender, token) =>
    selectionOrFailure<OpenDocumentDTO>(selections, token, 'document-open', sender.webContentsId)
      ?? services.files.openSelected(token, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileReopenRecent, (_event, sender, recentId) => services.files.reopenRecent(recentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileSave, (_event, sender, request) =>
    services.files.saveDocument(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileSaveAs, (_event, sender, request) =>
    selectionOrFailure<SaveDocumentResult>(selections, request.targetSelectionToken, 'document-save', sender.webContentsId)
      ?? services.files.saveDocumentAs(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileStat, (_event, sender, documentId) =>
    services.files.statDocument(documentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileReload, (_event, sender, documentId) =>
    services.files.reloadDocument(documentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileReveal, (_event, sender, documentId) =>
    services.files.revealDocument(documentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileTrash, (_event, sender, documentId) =>
    services.files.trashDocument(documentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileRename, (_event, sender, request) =>
    services.files.renameDocument(request.documentId, request.newBasename, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.fileCopyImportedImage, (_event, sender, request) =>
    ownedOrFailure<ImportedImageResult>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.future.unavailable('files.copyImportedImage'))

  registerValidatedInvoke(trusted, CHANNELS.workspaceOpen, (_event, sender, token) =>
    selectionOrFailure<WorkspaceDTO>(selections, token, 'workspace-open', sender.webContentsId)
      ?? services.future.unavailable('workspaces.open'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceClose, (_event, sender, workspaceId) =>
    ownedOrFailure<void>(capabilities, workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.close'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceList, (_event, sender, request) =>
    ownedOrFailure<WorkspaceEntry[]>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.list'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceCreateFile, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.createFile'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceCreateDirectory, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.createDirectory'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceRename, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.rename'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceMove, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.move'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceTrash, (_event, sender, request) =>
    ownedOrFailure<void>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.trash'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceOpenEntry, (_event, sender, request) =>
    ownedOrFailure<OpenDocumentDTO>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.openEntry'))
  registerValidatedInvoke(trusted, CHANNELS.workspaceSearch, (_event, sender, request) =>
    ownedOrFailure<{ searchId: string }>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.future.unavailable('workspaces.search'))
  registerValidatedSend(trusted, CHANNELS.workspaceCancelSearch, () => undefined)

  registerValidatedInvoke(trusted, CHANNELS.resourceResolveLink, (_event, sender, request) =>
    ownedOrFailure<ResolvedDocumentLink>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.resources.resolveLink(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.resourceImportLocalImage, (_event, sender, request) =>
    ownedOrFailure<ImportedImageResult>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.future.unavailable('resources.importLocalImage'))
  registerValidatedSend(trusted, CHANNELS.resourceInvalidateDocumentCache, (_event, sender, documentId) => {
    if (!capabilities.owns(documentId, 'document', sender.webContentsId)) return
    try { services.resources.invalidateDocumentCache(documentId, sender.webContentsId) } catch { /* fail closed */ }
  })

  registerValidatedInvoke(trusted, CHANNELS.settingsGet, () => services.future.unavailable<MarkHereSettings>('settings.get'))
  registerValidatedInvoke(trusted, CHANNELS.settingsUpdate, () => services.future.unavailable<MarkHereSettings>('settings.update'))
  registerValidatedInvoke(trusted, CHANNELS.settingsReset, () => services.future.unavailable<MarkHereSettings>('settings.reset'))
  registerValidatedInvoke(trusted, CHANNELS.settingsGetKeybindings, () => services.future.unavailable<KeybindingConfig>('settings.getKeybindings'))
  registerValidatedInvoke(trusted, CHANNELS.settingsUpdateKeybindings, () => services.future.unavailable<KeybindingConfig>('settings.updateKeybindings'))

  registerValidatedInvoke(trusted, CHANNELS.recoveryUpdate, (_event, sender, request) =>
    ownedOrFailure<RecoveryUpdateResult>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.recovery.updateSnapshot(request, sender.windowId))
  registerValidatedInvoke(trusted, CHANNELS.recoveryList, () => services.recovery.listRecoverable())
  registerValidatedInvoke(trusted, CHANNELS.recoveryGet, (_event, _sender, snapshotId) => services.recovery.getSnapshot(snapshotId))
  registerValidatedInvoke(trusted, CHANNELS.recoveryDiscard, (_event, _sender, snapshotId) => services.recovery.discard(snapshotId))
  registerValidatedInvoke(trusted, CHANNELS.recoveryDiscardForDocument, (_event, sender, documentId, throughRevision) =>
    ownedOrFailure<void>(capabilities, documentId, 'document', sender.webContentsId)
      ?? services.recovery.discardForDocument(documentId, throughRevision))

  registerValidatedInvoke(trusted, CHANNELS.exportStart, (_event, sender, request) =>
    ownedOrFailure<{ jobId: string }>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? selectionOrFailure<{ jobId: string }>(selections, request.targetSelectionToken, 'export-target', sender.webContentsId)
      ?? services.future.unavailable('exports.start'))
  registerValidatedInvoke(trusted, CHANNELS.exportGetStatus, (_event, sender, jobId) =>
    ownedOrFailure<ExportJobDTO>(capabilities, jobId, 'export-job', sender.webContentsId)
      ?? services.future.unavailable('exports.getStatus'))
  registerValidatedSend(trusted, CHANNELS.exportCancel, () => undefined)

  registerValidatedInvoke(trusted, CHANNELS.shellOpenExternal, (_event, _sender, url) => services.shell.openExternal(url))
  registerValidatedInvoke(trusted, CHANNELS.shellShowItemInFolder, (_event, sender, documentId) =>
    services.files.revealDocument(documentId, sender.webContentsId))

  registerValidatedInvoke(trusted, CHANNELS.clipboardReadImageForImport, () => services.clipboard.readImageForImport())
  registerValidatedInvoke(trusted, CHANNELS.clipboardWriteText, (_event, _sender, text) => services.clipboard.writeText(text))
  registerValidatedInvoke(trusted, CHANNELS.clipboardWriteRich, (_event, _sender, request) => services.clipboard.writeRich(request))

  registerValidatedInvoke(trusted, CHANNELS.updateCheck, () => services.future.unavailable<UpdateStatus>('updates.check'))
  registerValidatedInvoke(trusted, CHANNELS.updateDownload, () => services.future.unavailable<void>('updates.download'))
  registerValidatedInvoke(trusted, CHANNELS.updateInstallAndRestart, () => services.future.unavailable<void>('updates.installAndRestart'))
  registerValidatedInvoke(trusted, CHANNELS.updateGetStatus, () => services.future.unavailable<UpdateStatus>('updates.getStatus'))
}

export function attachWindowStateEvents(
  window: BrowserWindow,
  sendWindowState: (window: BrowserWindow) => void
): void {
  const publish = (): void => sendWindowState(window)
  window.on('maximize', publish)
  window.on('unmaximize', publish)
  window.on('enter-full-screen', publish)
  window.on('leave-full-screen', publish)
  window.on('always-on-top-changed', publish)
}
