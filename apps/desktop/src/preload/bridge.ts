import {
  CHANNELS,
  type MarkHereDesktopApi
} from '@markhere/ipc-contract'
import { transport } from './transport'

export const markhereBridge: MarkHereDesktopApi = Object.freeze({
  version: 1 as const,
  app: Object.freeze({
    getInfo: () => transport.invoke(CHANNELS.appGetInfo),
    getPlatformInfo: () => transport.invoke(CHANNELS.appGetPlatformInfo),
    requestQuit: () => transport.invoke(CHANNELS.appRequestQuit),
    openAbout: () => transport.invoke(CHANNELS.appOpenAbout),
    openSettings: (section) => transport.invoke(CHANNELS.appOpenSettings, section)
  }),
  window: Object.freeze({
    minimize: () => transport.send(CHANNELS.windowMinimize),
    toggleMaximize: () => transport.send(CHANNELS.windowToggleMaximize),
    close: () => transport.send(CHANNELS.windowClose),
    toggleFullScreen: () => transport.send(CHANNELS.windowToggleFullScreen),
    isMaximized: () => transport.invoke(CHANNELS.windowIsMaximized),
    isFullScreen: () => transport.invoke(CHANNELS.windowIsFullScreen),
    setAlwaysOnTop: (enabled) => transport.invoke(CHANNELS.windowSetAlwaysOnTop, enabled)
  }),
  dialogs: Object.freeze({
    openDocuments: (options) => transport.invoke(CHANNELS.dialogsOpenDocuments, options),
    openWorkspace: () => transport.invoke(CHANNELS.dialogsOpenWorkspace),
    chooseSaveDocument: (defaultName) => transport.invoke(CHANNELS.dialogsChooseSaveDocument, defaultName),
    chooseExportTarget: (request) => transport.invoke(CHANNELS.dialogsChooseExportTarget, request),
    confirm: (request) => transport.invoke(CHANNELS.dialogsConfirm, request)
  }),
  files: Object.freeze({
    openSelected: (selectionToken) => transport.invoke(CHANNELS.fileOpenSelected, selectionToken),
    reopenRecent: (recentId) => transport.invoke(CHANNELS.fileReopenRecent, recentId),
    saveDocument: (request) => transport.invoke(CHANNELS.fileSave, request),
    saveDocumentAs: (request) => transport.invoke(CHANNELS.fileSaveAs, request),
    statDocument: (documentId) => transport.invoke(CHANNELS.fileStat, documentId),
    reloadDocument: (documentId) => transport.invoke(CHANNELS.fileReload, documentId),
    revealDocument: (documentId) => transport.invoke(CHANNELS.fileReveal, documentId),
    trashDocument: (documentId) => transport.invoke(CHANNELS.fileTrash, documentId),
    renameDocument: (request) => transport.invoke(CHANNELS.fileRename, request),
    copyImportedImage: (request) => transport.invoke(CHANNELS.fileCopyImportedImage, request)
  }),
  workspaces: Object.freeze({
    open: (selectionToken) => transport.invoke(CHANNELS.workspaceOpen, selectionToken),
    close: (workspaceId) => transport.invoke(CHANNELS.workspaceClose, workspaceId),
    list: (request) => transport.invoke(CHANNELS.workspaceList, request),
    createFile: (request) => transport.invoke(CHANNELS.workspaceCreateFile, request),
    createDirectory: (request) => transport.invoke(CHANNELS.workspaceCreateDirectory, request),
    rename: (request) => transport.invoke(CHANNELS.workspaceRename, request),
    move: (request) => transport.invoke(CHANNELS.workspaceMove, request),
    trash: (request) => transport.invoke(CHANNELS.workspaceTrash, request),
    openEntry: (request) => transport.invoke(CHANNELS.workspaceOpenEntry, request),
    search: (request) => transport.invoke(CHANNELS.workspaceSearch, request),
    cancelSearch: (searchId) => transport.send(CHANNELS.workspaceCancelSearch, searchId)
  }),
  resources: Object.freeze({
    resolveLink: (request) => transport.invoke(CHANNELS.resourceResolveLink, request),
    importLocalImage: (request) => transport.invoke(CHANNELS.resourceImportLocalImage, request),
    invalidateDocumentCache: (documentId) => transport.send(CHANNELS.resourceInvalidateDocumentCache, documentId)
  }),
  settings: Object.freeze({
    get: () => transport.invoke(CHANNELS.settingsGet),
    update: (patch) => transport.invoke(CHANNELS.settingsUpdate, patch),
    reset: (section) => transport.invoke(CHANNELS.settingsReset, section),
    getKeybindings: () => transport.invoke(CHANNELS.settingsGetKeybindings),
    updateKeybindings: (config) => transport.invoke(CHANNELS.settingsUpdateKeybindings, config)
  }),
  recovery: Object.freeze({
    updateSnapshot: (request) => transport.invoke(CHANNELS.recoveryUpdate, request),
    listRecoverable: () => transport.invoke(CHANNELS.recoveryList),
    getSnapshot: (snapshotId) => transport.invoke(CHANNELS.recoveryGet, snapshotId),
    discard: (snapshotId) => transport.invoke(CHANNELS.recoveryDiscard, snapshotId),
    discardForDocument: (documentId, throughRevision) =>
      transport.invoke(CHANNELS.recoveryDiscardForDocument, documentId, throughRevision)
  }),
  exports: Object.freeze({
    start: (request) => transport.invoke(CHANNELS.exportStart, request),
    cancel: (jobId) => transport.send(CHANNELS.exportCancel, jobId),
    getStatus: (jobId) => transport.invoke(CHANNELS.exportGetStatus, jobId)
  }),
  shell: Object.freeze({
    openExternal: (url) => transport.invoke(CHANNELS.shellOpenExternal, url),
    showItemInFolder: (documentId) => transport.invoke(CHANNELS.shellShowItemInFolder, documentId)
  }),
  clipboard: Object.freeze({
    readImageForImport: () => transport.invoke(CHANNELS.clipboardReadImageForImport),
    writeText: (text) => transport.invoke(CHANNELS.clipboardWriteText, text),
    writeRich: (request) => transport.invoke(CHANNELS.clipboardWriteRich, request)
  }),
  updates: Object.freeze({
    check: () => transport.invoke(CHANNELS.updateCheck),
    download: () => transport.invoke(CHANNELS.updateDownload),
    installAndRestart: () => transport.invoke(CHANNELS.updateInstallAndRestart),
    getStatus: () => transport.invoke(CHANNELS.updateGetStatus)
  }),
  events: Object.freeze({
    onDocumentExternalChange: (callback) => transport.on(CHANNELS.eventDocumentExternalChange, callback),
    onWorkspaceChange: (callback) => transport.on(CHANNELS.eventWorkspaceChange, callback),
    onExportProgress: (callback) => transport.on(CHANNELS.eventExportProgress, callback),
    onExportCompleted: (callback) => transport.on(CHANNELS.eventExportCompleted, callback),
    onUpdateStatus: (callback) => transport.on(CHANNELS.eventUpdateStatus, callback),
    onAppCommand: (callback) => transport.on(CHANNELS.eventAppCommand, callback),
    onWindowState: (callback) => transport.on(CHANNELS.eventWindowState, callback)
  })
})
