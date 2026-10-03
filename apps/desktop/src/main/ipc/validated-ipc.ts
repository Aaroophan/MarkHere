import { randomUUID } from 'node:crypto'
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
import type { LocalLogger } from '../logging/local-logger'
import { IpcAbuseProtector, exceedsGenericIpcBudget } from '../security/ipc-abuse-protector'
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

let logger: LocalLogger | undefined
let abuse = new IpcAbuseProtector()

export function configureValidatedIpcSecurity(options: { logger?: LocalLogger; abuseProtector?: IpcAbuseProtector }): void {
  logger = options.logger
  abuse = options.abuseProtector ?? abuse
}

function invalid(sender: TrustedWebContentsRecord, channel: string, reason: string): boolean {
  const blocked = abuse.noteInvalid(sender.webContentsId)
  logger?.warn('ipc.request.rejected', { windowId: sender.windowId, metadata: { channel, reason, blocked } })
  return blocked
}

export function registerValidatedInvoke<K extends InvokeChannel>(
  registry: TrustedWebContentsRegistry,
  channel: K,
  handler: InvokeHandler<K>
): void {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]): Promise<ApiResult<unknown>> => {
    let sender: TrustedWebContentsRecord
    try { sender = registry.assertTrustedEvent(event) }
    catch {
      logger?.warn('ipc.sender.rejected', { metadata: { channel } })
      return failure('SEC_UNTRUSTED_IPC_SENDER', 'security', 'error.untrustedIpcSender', false)
    }

    if (abuse.isBlocked(sender.webContentsId)) return failure('IPC_RATE_LIMITED', 'security', 'error.ipcRateLimited', true, { channel })
    if (exceedsGenericIpcBudget(rawArgs)) {
      invalid(sender, channel, 'generic-budget')
      return failure('IPC_REQUEST_TOO_LARGE', 'validation', 'error.ipcRequestTooLarge', true, { channel })
    }

    const parsed = INVOKE_ARG_SCHEMAS[channel].safeParse(rawArgs)
    if (!parsed.success) {
      invalid(sender, channel, 'schema')
      return failure('IPC_INVALID_ARGUMENTS', 'validation', 'error.invalidIpcArguments', true, { channel })
    }

    const started = Date.now()
    const correlationId = randomUUID()
    try {
      const result = await handler(event, sender, ...(parsed.data as InvokeChannelMap[K]['args'])) as ApiResult<unknown>
      logger?.debug('ipc.invoke.completed', { correlationId, windowId: sender.windowId, durationMs: Date.now() - started, result: result.ok ? 'ok' : 'error', errorCode: result.ok ? undefined : result.error.code, metadata: { channel } })
      return result
    } catch {
      logger?.error('ipc.handler.failed', { correlationId, windowId: sender.windowId, durationMs: Date.now() - started, errorCode: 'IPC_HANDLER_FAILED', metadata: { channel } })
      return failure('IPC_HANDLER_FAILED', 'internal', 'error.internalOperationFailed', true, { channel })
    }
  })
}

export function registerValidatedSend<K extends SendChannel>(
  registry: TrustedWebContentsRegistry,
  channel: K,
  handler: SendHandler<K>
): void {
  ipcMain.on(channel, (event, ...rawArgs: unknown[]) => {
    let sender: TrustedWebContentsRecord
    try { sender = registry.assertTrustedEvent(event) }
    catch { logger?.warn('ipc.sender.rejected', { metadata: { channel } }); return }
    if (abuse.isBlocked(sender.webContentsId) || exceedsGenericIpcBudget(rawArgs)) { invalid(sender, channel, 'budget-or-rate'); return }
    const parsed = SEND_ARG_SCHEMAS[channel].safeParse(rawArgs)
    if (!parsed.success) { invalid(sender, channel, 'schema'); return }
    void Promise.resolve(handler(event, sender, ...(parsed.data as SendChannelMap[K]))).catch(() => {
      logger?.error('ipc.send-handler.failed', { windowId: sender.windowId, errorCode: 'IPC_HANDLER_FAILED', metadata: { channel } })
    })
  })
}
