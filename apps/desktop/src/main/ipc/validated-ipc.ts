import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import {
  INVOKE_ARG_SCHEMAS,
  SEND_ARG_SCHEMAS,
  type ApiResult,
  type InvokeChannel,
  type InvokeChannelMap,
  type SendChannel,
  type SendChannelMap
} from '@markhere/ipc-contract'
import type { TrustedWebContentsRecord, TrustedWebContentsRegistry } from '../security/trusted-web-contents-registry'
import { failure } from '../services/api-results'

export type InvokeHandler<K extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  sender: TrustedWebContentsRecord,
  ...args: InvokeChannelMap[K]['args']
) => Promise<InvokeChannelMap[K]['result']> | InvokeChannelMap[K]['result']

export type SendHandler<K extends SendChannel> = (
  event: IpcMainEvent,
  sender: TrustedWebContentsRecord,
  ...args: SendChannelMap[K]
) => void | Promise<void>

export function registerValidatedInvoke<K extends InvokeChannel>(
  registry: TrustedWebContentsRegistry,
  channel: K,
  handler: InvokeHandler<K>
): void {
  ipcMain.handle(channel, async (event, ...rawArgs): Promise<ApiResult<unknown>> => {
    let sender: TrustedWebContentsRecord
    try {
      sender = registry.assertTrustedEvent(event)
    } catch {
      return failure('SEC_UNTRUSTED_IPC_SENDER', 'security', 'error.untrustedIpcSender', false)
    }

    const parsed = INVOKE_ARG_SCHEMAS[channel].safeParse(rawArgs)
    if (!parsed.success) {
      return failure('IPC_INVALID_ARGUMENTS', 'validation', 'error.invalidIpcArguments', true, {
        channel
      })
    }

    try {
      return await handler(
        event,
        sender,
        ...(parsed.data as InvokeChannelMap[K]['args'])
      ) as ApiResult<unknown>
    } catch {
      return failure('IPC_HANDLER_FAILED', 'internal', 'error.internalOperationFailed', true, {
        channel
      })
    }
  })
}

export function registerValidatedSend<K extends SendChannel>(
  registry: TrustedWebContentsRegistry,
  channel: K,
  handler: SendHandler<K>
): void {
  ipcMain.on(channel, (event, ...rawArgs) => {
    let sender: TrustedWebContentsRecord
    try {
      sender = registry.assertTrustedEvent(event)
    } catch {
      return
    }

    const parsed = SEND_ARG_SCHEMAS[channel].safeParse(rawArgs)
    if (!parsed.success) return

    void Promise.resolve(
      handler(event, sender, ...(parsed.data as SendChannelMap[K]))
    ).catch(() => {
      // Issue 8 replaces this intentionally minimal fail-closed path with the
      // redacted structured logger. Never echo payloads here.
    })
  })
}
