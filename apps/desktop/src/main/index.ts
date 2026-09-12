import { app } from 'electron'
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
  const closeCoordinator = new CloseCoordinator()
  const events = new RendererEventDispatcher()
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
    onRendererReady: (webContentsId) => lifecycle.markRendererReady(webContentsId),
    onWindowDestroyed: (webContentsId) => {
      selections.revokeAllForWebContents(webContentsId)
      commands?.clearContext(webContentsId)
    }
  })
  lifecycle.attachWindowManager(windows)

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
    future: new FutureService()
  })

  commands = new ApplicationCommandRegistry(events, () => void lifecycle.requestQuit())
  installApplicationMenu(commands)

  await lifecycle.enqueueInitial(getUserArgv(process.argv, app.isPackaged), process.cwd())
  const firstWindow = windows.createEditorWindow()
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
