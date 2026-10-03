import type { BrowserWindow } from 'electron'
import {
  CHANNELS,
  type ApiResult,
  type OpenDocumentDTO,
  type SaveDocumentResult,
  type FileMutationResult,
  type ImportedImageResult,
  type WorkspaceDTO,
  type WorkspaceEntry,
  type ResolvedDocumentLink,
  type RecoveryUpdateResult,
} from '@markhere/ipc-contract'
import type { TrustedWebContentsRegistry } from '../security/trusted-web-contents-registry'
import type { CapabilityOwnershipRegistry, CapabilityKind } from '../security/capability-ownership-registry'
import type { AppService } from '../services/app-service'
import type { WindowService } from '../services/window-service'
import type { DialogService } from '../services/dialog-service'
import type { ShellService } from '../services/shell-service'
import type { ClipboardService } from '../services/clipboard-service'
import type { FutureService } from '../services/future-service'
import type { UpdateService } from '../services/update-service'
import type { FileService } from '../documents/file-service'
import type { RecoveryService } from '../storage/recovery-service'
import type { ResourceService } from '../resources/resource-service'
import type { SettingsService } from '../storage/settings-service'
import type { KeybindingService } from '../storage/keybinding-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { ExportCoordinator } from '../export/export-coordinator'
import type { DiagnosticService } from '../diagnostics/diagnostic-service'
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
  readonly settings: SettingsService
  readonly keybindings: KeybindingService
  readonly workspace: WorkspaceService
  readonly exports: ExportCoordinator
  readonly diagnostics: DiagnosticService
  readonly updates: UpdateService
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
  registerValidatedInvoke(trusted, CHANNELS.appOpenDefaultAppsSettings, () => services.app.openDefaultAppsSettings())

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
  registerValidatedInvoke(trusted, CHANNELS.fileListRecent, () => services.files.listRecent())
  registerValidatedInvoke(trusted, CHANNELS.fileRemoveRecent, (_event, _sender, recentId) => services.files.removeRecent(recentId))
  registerValidatedInvoke(trusted, CHANNELS.fileClearRecent, () => services.files.clearRecent())
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
      ?? services.files.copyImportedImage(request, sender.webContentsId))

  registerValidatedInvoke(trusted, CHANNELS.workspaceOpen, (_event, sender, token) =>
    selectionOrFailure<WorkspaceDTO>(selections, token, 'workspace-open', sender.webContentsId)
      ?? services.workspace.openSelected(token, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceReopenRecent, (_event, sender, recentId) => services.workspace.reopenRecent(recentId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceListRecent, async () => ({ ok: true as const, data: await services.workspace.listRecent() }))
  registerValidatedInvoke(trusted, CHANNELS.workspaceRemoveRecent, async (_event, _sender, recentId) => { await services.workspace.removeRecent(recentId); return { ok: true as const, data: undefined } })
  registerValidatedInvoke(trusted, CHANNELS.workspaceClearRecent, async () => { await services.workspace.clearRecent(); return { ok: true as const, data: undefined } })
  registerValidatedInvoke(trusted, CHANNELS.workspaceClose, (_event, sender, workspaceId) =>
    ownedOrFailure<void>(capabilities, workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.close(workspaceId, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceList, (_event, sender, request) =>
    ownedOrFailure<WorkspaceEntry[]>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.list(request.workspaceId, request.relativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceCreateFile, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.createFile(request.workspaceId, request.relativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceCreateDirectory, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.createDirectory(request.workspaceId, request.relativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceRename, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.rename(request.workspaceId, request.relativePath, request.newName, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceMove, (_event, sender, request) =>
    ownedOrFailure<FileMutationResult>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.move(request.workspaceId, request.relativePath, request.targetRelativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceTrash, (_event, sender, request) =>
    ownedOrFailure<void>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.trash(request.workspaceId, request.relativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceOpenEntry, (_event, sender, request) =>
    ownedOrFailure<OpenDocumentDTO>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.openEntry(request.workspaceId, request.relativePath, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.workspaceSearch, (_event, sender, request) =>
    ownedOrFailure<{ searchId: string }>(capabilities, request.workspaceId, 'workspace', sender.webContentsId)
      ?? services.workspace.search(request, sender.webContentsId))
  registerValidatedSend(trusted, CHANNELS.workspaceCancelSearch, (_event, sender, searchId) => services.workspace.cancelSearch(searchId, sender.webContentsId))

  registerValidatedInvoke(trusted, CHANNELS.resourceResolveLink, (_event, sender, request) =>
    ownedOrFailure<ResolvedDocumentLink>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.resources.resolveLink(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.resourceApproveRemoteImages, (_event, sender, request) =>
    ownedOrFailure<{ approved: number }>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.resources.approveRemoteImages(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.resourceImportLocalImage, (_event, sender, request) =>
    ownedOrFailure<ImportedImageResult>(capabilities, request.documentId, 'document', sender.webContentsId)
      ?? services.future.unavailable('resources.importLocalImage'))
  registerValidatedSend(trusted, CHANNELS.resourceInvalidateDocumentCache, (_event, sender, documentId) => {
    if (!capabilities.owns(documentId, 'document', sender.webContentsId)) return
    try { services.resources.invalidateDocumentCache(documentId, sender.webContentsId) } catch { /* fail closed */ }
  })

  registerValidatedInvoke(trusted, CHANNELS.settingsGet, () => services.settings.get())
  registerValidatedInvoke(trusted, CHANNELS.settingsUpdate, (_event, _sender, patch) => services.settings.update(patch))
  registerValidatedInvoke(trusted, CHANNELS.settingsReset, (_event, _sender, section) => services.settings.reset(section))
  registerValidatedInvoke(trusted, CHANNELS.settingsGetKeybindings, () => services.keybindings.get())
  registerValidatedInvoke(trusted, CHANNELS.settingsUpdateKeybindings, (_event, _sender, config) => services.keybindings.update(config))

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
    selectionOrFailure<{ jobId: string }>(selections, request.targetSelectionToken, 'export-target', sender.webContentsId)
      ?? services.exports.start(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.exportPrint, (_event, sender, request) =>
    services.exports.print(request, sender.webContentsId))
  registerValidatedInvoke(trusted, CHANNELS.exportGetStatus, (_event, sender, jobId) =>
    services.exports.getStatus(jobId, sender.webContentsId))
  registerValidatedSend(trusted, CHANNELS.exportCancel, (_event, sender, jobId) => services.exports.cancel(jobId, sender.webContentsId))

  registerValidatedInvoke(trusted, CHANNELS.shellOpenExternal, (_event, _sender, url) => services.shell.openExternal(url))
  registerValidatedInvoke(trusted, CHANNELS.shellShowItemInFolder, (_event, sender, documentId) =>
    services.files.revealDocument(documentId, sender.webContentsId))

  registerValidatedInvoke(trusted, CHANNELS.clipboardReadImageForImport, () => services.clipboard.readImageForImport())
  registerValidatedInvoke(trusted, CHANNELS.clipboardWriteText, (_event, _sender, text) => services.clipboard.writeText(text))
  registerValidatedInvoke(trusted, CHANNELS.clipboardWriteRich, (_event, _sender, request) => services.clipboard.writeRich(request))

  registerValidatedInvoke(trusted, CHANNELS.updateCheck, () => services.updates.check())
  registerValidatedInvoke(trusted, CHANNELS.updateDownload, () => services.updates.download())
  registerValidatedInvoke(trusted, CHANNELS.updateInstallAndRestart, () => services.updates.installAndRestart())
  registerValidatedInvoke(trusted, CHANNELS.updateGetStatus, () => services.updates.getStatus())

  registerValidatedInvoke(trusted, CHANNELS.diagnosticsGetSafeModeStatus, () => services.diagnostics.getSafeModeStatus())
  registerValidatedInvoke(trusted, CHANNELS.diagnosticsCreateBundle, () => services.diagnostics.createBundle())
  registerValidatedInvoke(trusted, CHANNELS.diagnosticsOpenLogsFolder, () => services.diagnostics.openLogsFolder())
  registerValidatedInvoke(trusted, CHANNELS.diagnosticsClearLogs, () => services.diagnostics.clearLogs())
  registerValidatedInvoke(trusted, CHANNELS.diagnosticsReportRendererFault, (_event, sender, report) => services.diagnostics.reportRendererFault(report, sender.windowId))
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
