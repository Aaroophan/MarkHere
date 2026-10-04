import { app, crashReporter, dialog, nativeTheme, webContents } from 'electron'
import { join } from 'node:path'
import { CHANNELS } from '@markhere/ipc-contract'
import { MARKHERE_IDENTITY, MARKHERE_PRODUCT_NAME } from '@markhere/shared'
import { SecurityPolicy } from '@markhere/security-core'
import { AppLifecycle, getUserArgv } from './app-lifecycle'
import { registerPrivilegedSchemes, installAppProtocolHandlers } from './protocols/app-protocol'
import { TrustedWebContentsRegistry } from './security/trusted-web-contents-registry'
import { CapabilityOwnershipRegistry } from './security/capability-ownership-registry'
import { CloseCoordinator } from './windows/close-coordinator'
import { WindowManager } from './windows/window-manager'
import { RendererEventDispatcher } from './ipc/renderer-events'
import { SelectionTokenStore } from './services/selection-token-store'
import { DialogService } from './services/dialog-service'
import { ShellService } from './services/shell-service'
import { ClipboardService } from './services/clipboard-service'
import { FutureService } from './services/future-service'
import { FileCapabilityRegistry } from './documents/file-capability-registry'
import { WatchService } from './documents/watch-service'
import { FileService } from './documents/file-service'
import { RecoveryService } from './storage/recovery-service'
import { RecentDocumentStore } from './storage/recent-document-store'
import { SessionPersistenceService } from './storage/session-persistence-service'
import { WindowService } from './services/window-service'
import { AppService } from './services/app-service'
import { registerIpcHandlers } from './ipc/register-ipc'
import { ApplicationCommandRegistry } from './commands/command-registry'
import { installApplicationMenu } from './commands/application-menu'
import { maybeWriteSecurityProbe } from './security/security-probe'
import { ResourceCapabilityBroker } from './resources/resource-capability-broker'
import { ResourceService } from './resources/resource-service'
import { SettingsService } from './storage/settings-service'
import { KeybindingService } from './storage/keybinding-service'
import { WorkspaceCapabilityRegistry } from './workspace/workspace-capability-registry'
import { WorkspaceWatchService } from './workspace/workspace-watch-service'
import { WorkspaceSearchService } from './workspace/workspace-search-service'
import { WorkspaceService } from './workspace/workspace-service'
import { ExportAssetResolver } from './export/export-asset-resolver'
import { ExportTempStorage } from './export/export-temp-storage'
import { ExportWorkerClient } from './export/export-worker-client'
import { PdfPrintSurface } from './export/pdf-print-surface'
import { ExportCoordinator } from './export/export-coordinator'
import { PrintDocumentStore } from './export/print-document-store'
import { LocalLogger } from './logging/local-logger'
import { CrashHealthService } from './diagnostics/crash-health-service'
import { DiagnosticService } from './diagnostics/diagnostic-service'
import { IpcAbuseProtector } from './security/ipc-abuse-protector'
import { RemoteResourceApprovalRegistry } from './security/remote-resource-approval-registry'
import { configureValidatedIpcSecurity } from './ipc/validated-ipc'
import { UpdateService } from './services/update-service'

registerPrivilegedSchemes()
app.enableSandbox()
app.setName(MARKHERE_PRODUCT_NAME)
const testUserData = process.env.MARKHERE_TEST_USER_DATA?.trim()
app.setPath('userData', testUserData && !app.isPackaged ? testUserData : join(app.getPath('appData'), MARKHERE_IDENTITY.userDataFolder))
crashReporter.start({ productName: MARKHERE_PRODUCT_NAME, uploadToServer: false, globalExtra: { privacyMode: 'local-only' } })

const lifecycle = new AppLifecycle()
const ownsSingleInstance = lifecycle.initializeEarly()

async function boot(): Promise<void> {
  await app.whenReady()

  const logger = new LocalLogger('main')
  const securityPolicy = new SecurityPolicy()
  const crashHealth = new CrashHealthService()
  const safeMode = await crashHealth.markStarting()
  configureValidatedIpcSecurity({ logger, abuseProtector: new IpcAbuseProtector() })
  logger.info('application.starting', { metadata: { safeMode, packaged: app.isPackaged } })
  process.on('uncaughtException', () => {
    logger.fatal('main.uncaught-exception', { errorCode: 'MAIN_UNCAUGHT_EXCEPTION' })
    void logger.flush().finally(() => app.exit(1))
  })
  process.on('unhandledRejection', () => {
    logger.error('main.unhandled-rejection', { errorCode: 'MAIN_UNHANDLED_REJECTION' })
  })

  const trusted = new TrustedWebContentsRegistry()
  const capabilities = new CapabilityOwnershipRegistry()
  const selections = new SelectionTokenStore()
  const fileCapabilities = new FileCapabilityRegistry(capabilities)
  const remoteApprovals = new RemoteResourceApprovalRegistry()
  const resourceBroker = new ResourceCapabilityBroker(capabilities, (documentId) => remoteApprovals.revokeDocument(documentId))
  const printDocuments = new PrintDocumentStore()
  const resources = new ResourceService(fileCapabilities, selections, resourceBroker, remoteApprovals, securityPolicy)
  let remoteResourcePolicy: 'block' | 'ask' | 'allow-https' = 'block'
  installAppProtocolHandlers(undefined, resourceBroker, printDocuments, { policy: securityPolicy, remoteResourcePolicy: () => remoteResourcePolicy, isRemoteImageApproved: (url, ownerWebContentsId) => remoteApprovals.isApproved(url, ownerWebContentsId) })
  const recovery = new RecoveryService()
  const recents = new RecentDocumentStore()
  const sessionPersistence = new SessionPersistenceService()
  const closeCoordinator = new CloseCoordinator()
  const events = new RendererEventDispatcher()
  const watch = new WatchService((change) => {
    if (change.selfWrite) return
    const capability = fileCapabilities.find(change.documentId)
    if (!capability) return
    const target = webContents.fromId(capability.ownerWebContentsId)
    if (!target) return
    events.send(target, 'mh:v1:event:document-external-change', {
      documentId: change.documentId,
      kind: change.kind,
      actualFingerprint: change.actualFingerprint,
      detectedAt: new Date().toISOString()
    })
  })
  let commands: ApplicationCommandRegistry | undefined
  let workspace: WorkspaceService | undefined
  let exportCoordinator: ExportCoordinator | undefined
  const files = new FileService({
    selections, files: fileCapabilities, watch, recents, resources: resourceBroker,
    onSaved: async (documentId, revision) => { await recovery.discardForDocument(documentId, revision) },
    onOpened: (ownerWebContentsId, writable) => commands?.setContext(ownerWebContentsId, { hasDocument: true, canSave: writable, editable: true })
  })
  const isDevelopment = process.env.NODE_ENV !== 'production'

  const windows = new WindowManager({
    trustedRegistry: trusted,
    capabilityRegistry: capabilities,
    closeCoordinator,
    isDevelopment,
    ...(process.env.ELECTRON_RENDERER_URL
      ? { developmentRendererUrl: process.env.ELECTRON_RENDERER_URL }
      : {}),
    onWindowState: (window) => events.sendWindowState(window),
    onWindowCreated: (window, appWindowId) => {
      closeCoordinator.setGuard(window.id, async () => {
        if (!(await recovery.hasRecoverableForWindow(appWindowId))) return 'allow'
        const choice = await dialog.showMessageBox(window, {
          type: 'warning',
          title: 'Unsaved changes',
          message: 'This window has unsaved Markdown changes.',
          detail: 'Save the active document, explicitly discard the recovery snapshots, or cancel closing.',
          buttons: ['Save', 'Discard', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          noLink: true
        })
        if (choice.response === 0) {
          events.sendAppCommand(window, { id: 'file.save', source: 'system' })
          return 'deny'
        }
        if (choice.response === 1) {
          await recovery.discardForWindow(appWindowId)
          return 'allow'
        }
        return 'deny'
      })
    },
    onRendererCrashed: (webContentsId, reason) => {
      logger.error('renderer.process.gone', { errorCode: 'RENDERER_PROCESS_GONE', metadata: { webContentsId, reason } })
      setTimeout(() => { if (windows.list().length === 0) windows.createEditorWindow() }, 250).unref()
    },
    onRendererReady: (webContentsId) => lifecycle.markRendererReady(webContentsId),
    onWindowDestroyed: (webContentsId) => {
      exportCoordinator?.cancelAllForWebContents(webContentsId)
      selections.revokeAllForWebContents(webContentsId)
      resourceBroker.revokeAllForWebContents(webContentsId)
      remoteApprovals.revokeAllForWebContents(webContentsId)
      for (const documentId of fileCapabilities.revokeAllForWebContents(webContentsId)) watch.unwatchDocument(documentId)
      commands?.clearContext(webContentsId)
      void workspace?.revokeAllForWebContents(webContentsId)
      void sessionPersistence.save(windows.snapshotPersistedWindows())
    }
  })
  lifecycle.attachWindowManager(windows)

  const settings = new SettingsService({
    onChanged: (next) => {
      remoteResourcePolicy = next.remoteResources
      nativeTheme.themeSource = next.appearance
      for (const window of windows.list()) if (!window.isDestroyed()) events.send(window.webContents, CHANNELS.eventSettingsChanged, { settings: next })
    }
  })
  const initialSettings = await settings.get()
  if (initialSettings.ok) { remoteResourcePolicy = initialSettings.data.remoteResources; nativeTheme.themeSource = initialSettings.data.appearance }

  const keybindings = new KeybindingService({
    onChanged: (config) => {
      commands?.setKeybindings(config.bindings)
      for (const window of windows.list()) if (!window.isDestroyed()) events.send(window.webContents, CHANNELS.eventKeybindingsChanged, { config })
    }
  })

  const workspaceCapabilities = new WorkspaceCapabilityRegistry(capabilities)
  const workspaceWatch = new WorkspaceWatchService((change) => {
    const target = webContents.fromId(change.ownerWebContentsId)
    if (target) events.send(target, CHANNELS.eventWorkspaceChange, { workspaceId: change.workspaceId, kind: change.kind, relativePath: change.relativePath })
  })
  const workspaceSearch = new WorkspaceSearchService({
    onBatch: (ownerWebContentsId, event) => { const target = webContents.fromId(ownerWebContentsId); if (target) events.send(target, CHANNELS.eventWorkspaceSearchBatch, event) },
    onCompleted: (ownerWebContentsId, event) => { const target = webContents.fromId(ownerWebContentsId); if (target) events.send(target, CHANNELS.eventWorkspaceSearchCompleted, event) }
  })
  workspace = new WorkspaceService({ selections, capabilities: workspaceCapabilities, files, recents, watch: workspaceWatch, search: workspaceSearch })

  lifecycle.setStartupReadyHandler((request) => {
    void (async () => {
      const targetWindow = request.newWindow ? windows.createEditorWindow() : windows.focusOrCreateEditor()
      if (targetWindow.webContents.isLoadingMainFrame()) await new Promise<void>((resolve) => targetWindow.webContents.once('did-finish-load', () => resolve()))
      const documents = []
      let openedWorkspace
      for (const item of request.paths) {
        if (item.kind === 'file') {
          const result = await files.reopenPath(item.path, targetWindow.webContents.id)
          if (result.ok) documents.push(result.data)
          else logger.warn('activation.file.failed', { errorCode: result.error.code })
        } else if (item.kind === 'directory' && !openedWorkspace) {
          const result = await workspace!.openPathFromActivation(item.path, targetWindow.webContents.id)
          if (result.ok) openedWorkspace = result.data
          else logger.warn('activation.workspace.failed', { errorCode: result.error.code })
        } else if (item.kind === 'missing') logger.warn('activation.path.missing')
      }
      if (documents.length || openedWorkspace || request.mode) {
        events.send(targetWindow.webContents, CHANNELS.eventStartupActivation, {
          documents,
          ...(openedWorkspace ? { workspace: openedWorkspace } : {}),
          ...(request.mode ? { mode: request.mode } : {})
        })
      }
    })()
  })

  const exportTemp = new ExportTempStorage(app.getPath('temp'))
  const exportWorker = new ExportWorkerClient()
  const pdfPrintSurface = new PdfPrintSurface(windows, printDocuments)
  exportCoordinator = new ExportCoordinator({
    capabilities,
    selections,
    assets: new ExportAssetResolver(resourceBroker),
    temp: exportTemp,
    worker: exportWorker,
    printSurface: pdfPrintSurface,
    events: {
      progress: (ownerWebContentsId, event) => { const target = webContents.fromId(ownerWebContentsId); if (target) events.send(target, CHANNELS.eventExportProgress, event) },
      completed: (ownerWebContentsId, event) => { const target = webContents.fromId(ownerWebContentsId); if (target) events.send(target, CHANNELS.eventExportCompleted, event) }
    }
  })
  await exportCoordinator.initialize()

  const persistSession = async (): Promise<void> => {
    const currentSettings = await settings.get()
    const defaultMode = currentSettings.ok ? currentSettings.data.defaultMode : 'preview'
    await sessionPersistence.save(windows.snapshotPersistedWindows((webContentsId) =>
      fileCapabilities.listForWebContents(webContentsId).map((record) => ({ displayPath: record.path.displayPath, mode: defaultMode }))
    ))
  }
  const sessionTimer = setInterval(() => { void persistSession() }, 5_000)
  sessionTimer.unref()
  app.once('before-quit', () => { clearInterval(sessionTimer); exportCoordinator?.shutdown(); void persistSession(); void crashHealth.markCleanShutdown(); void logger.flush() })

  const appService = new AppService(windows, () => lifecycle.requestQuit())
  const diagnostics = new DiagnosticService(logger, crashHealth)
  const updates = new UpdateService(logger, (status) => {
    for (const window of windows.list()) if (!window.isDestroyed()) events.send(window.webContents, CHANNELS.eventUpdateStatus, status)
  })
  registerIpcHandlers({
    trusted,
    capabilities,
    selections,
    app: appService,
    window: new WindowService(windows),
    dialogs: new DialogService(selections),
    shell: new ShellService(securityPolicy),
    clipboard: new ClipboardService(),
    files,
    resources,
    recovery,
    settings,
    keybindings,
    workspace,
    exports: exportCoordinator,
    diagnostics,
    updates,
    future: new FutureService()
  })

  commands = new ApplicationCommandRegistry(events, () => void lifecycle.requestQuit())
  const initialKeybindings = await keybindings.get()
  if (initialKeybindings.ok) commands.setKeybindings(initialKeybindings.data.bindings)
  installApplicationMenu(commands)

  await lifecycle.enqueueInitial(getUserArgv(process.argv, app.isPackaged), process.cwd())
  const persisted = safeMode ? { schemaVersion: 1 as const, windows: [] } : await sessionPersistence.load()
  const restored = persisted.windows[0]
  const firstWindow = windows.createEditorWindow(restored?.bounds)
  firstWindow.webContents.once('did-finish-load', () => {
    void crashHealth.markHealthy()
    logger.info('application.renderer-ready', { metadata: { safeMode } })
    void maybeWriteSecurityProbe(firstWindow).then(() => {
      if (process.env.MARKHERE_SECURITY_PROBE_FILE) void lifecycle.requestQuit()
    })
  })
}

if (ownsSingleInstance) {
  void boot().catch(() => { app.exit(1) })
}
