import type { BrowserWindow, WebContents } from 'electron'
import {
  CHANNELS,
  type AppCommandEvent,
  type MainEventChannel,
  type MainEventChannelMap,
  type WindowStateEvent
} from '@markhere/ipc-contract'

export class RendererEventDispatcher {
  send<K extends MainEventChannel>(webContents: WebContents, channel: K, payload: MainEventChannelMap[K]): void {
    if (webContents.isDestroyed()) return
    webContents.send(channel, payload)
  }

  sendAppCommand(window: BrowserWindow, payload: AppCommandEvent): void {
    this.send(window.webContents, CHANNELS.eventAppCommand, payload)
  }

  sendWindowState(window: BrowserWindow): void {
    const payload: WindowStateEvent = {
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
      alwaysOnTop: window.isAlwaysOnTop()
    }
    this.send(window.webContents, CHANNELS.eventWindowState, payload)
  }
}
