import { ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  MAIN_EVENT_SCHEMAS,
  type InvokeChannel,
  type InvokeChannelMap,
  type MainEventChannel,
  type MainEventChannelMap,
  type SendChannel,
  type SendChannelMap
} from '@markhere/ipc-contract'

/**
 * The only raw ipcRenderer transport in the preload. It is not exported to
 * window and cannot accept renderer-provided channel names.
 */
export const transport = Object.freeze({
  invoke<K extends InvokeChannel>(
    channel: K,
    ...args: InvokeChannelMap[K]['args']
  ): Promise<InvokeChannelMap[K]['result']> {
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeChannelMap[K]['result']>
  },

  send<K extends SendChannel>(channel: K, ...args: SendChannelMap[K]): void {
    ipcRenderer.send(channel, ...args)
  },

  on<K extends MainEventChannel>(
    channel: K,
    callback: (payload: MainEventChannelMap[K]) => void
  ): () => void {
    const listener = (_event: IpcRendererEvent, rawPayload: unknown): void => {
      const schema = MAIN_EVENT_SCHEMAS[channel]
      const parsed = schema.safeParse(rawPayload)
      if (!parsed.success) return
      callback(parsed.data as MainEventChannelMap[K])
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
})
