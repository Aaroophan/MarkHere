import { app, dialog, webContents } from 'electron'
import { join } from 'node:path'
import { MARKHERE_IDENTITY, MARKHERE_PRODUCT_NAME } from '@markhere/shared'
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

registerPrivilegedSchemes()
app.enableSandbox()
app.setName(MARKHERE_PRODUCT_NAME)
app.setPath('userData', join(app.getPath('appData'), MARKHERE_IDENTITY.userDataFolder))

const lifecycle = new AppLifecycle()
const ownsSingleInstance = lifecycle.initializeEarly()

async function boot(): Promise<void> {
  await app.whenReady()
  installAppProtocolHandlers()

  const trusted = new TrustedWebContentsRegistry()
  const capabilities = new CapabilityOwnershipRegistry()
  const selections = new SelectionTokenStore()
  const fileCapabilities = new FileCapabilityRegistry(capabilities)
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
  const files = new FileService({ selections, files: fileCapabilities, watch, recents, onSaved: async (documentId, revision) => {
    await recovery.discardForDocument(documentId, revision)
  } })
  let commands: ApplicationCommandRegistry | undefined
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
    onRendererReady: (webContentsId) => lifecycle.markRendererReady(webContentsId),
    onWindowDestroyed: (webContentsId) => {
      selections.revokeAllForWebContents(webContentsId)
      for (const documentId of fileCapabilities.revokeAllForWebContents(webContentsId)) watch.unwatchDocument(documentId)
      commands?.clearContext(webContentsId)
      void sessionPersistence.save(windows.snapshotPersistedWindows())
    }
  })
  lifecycle.attachWindowManager(windows)

  const persistSession = async (): Promise<void> => {
    await sessionPersistence.save(windows.snapshotPersistedWindows((webContentsId) =>
      fileCapabilities.listForWebContents(webContentsId).map((record) => ({
        displayPath: record.path.displayPath,
        mode: 'wysiwyg' as const
      }))
    ))
  }
  const sessionTimer = setInterval(() => { void persistSession() }, 5_000)
  sessionTimer.unref()
  app.once('before-quit', () => { clearInterval(sessionTimer); void persistSession() })

  const appService = new AppService(windows, () => lifecycle.requestQuit())
  registerIpcHandlers({
    trusted,
    capabilities,
    selections,
    app: appService,
    window: new WindowService(windows),
    dialogs: new DialogService(selections),
    shell: new ShellService(),
    clipboard: new ClipboardService(),
    files,
    recovery,
    future: new FutureService()
  })

  commands = new ApplicationCommandRegistry(events, () => void lifecycle.requestQuit())
  installApplicationMenu(commands)

  await lifecycle.enqueueInitial(getUserArgv(process.argv, app.isPackaged), process.cwd())
  const persisted = await sessionPersistence.load()
  const restored = persisted.windows[0]
  const firstWindow = windows.createEditorWindow(restored?.bounds)
  firstWindow.webContents.once('did-finish-load', () => {
    void maybeWriteSecurityProbe(firstWindow).then(() => {
      if (process.env.MARKHERE_SECURITY_PROBE_FILE) void lifecycle.requestQuit()
    })
  })
}

if (ownsSingleInstance) {
  void boot().catch((error: unknown) => {
    // Issue 8 replaces this final bootstrap path with structured redacted logs.
    console.error('MarkHere bootstrap failed', error instanceof Error ? error.message : 'unknown error')
    app.exit(1)
  })
}
