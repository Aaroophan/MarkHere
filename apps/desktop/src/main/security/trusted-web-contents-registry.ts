import type { IpcMainEvent, IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'
import { randomUUID } from 'node:crypto'

export type TrustedWindowKind = 'editor' | 'settings'

export interface TrustedWebContentsRecord {
  readonly webContentsId: number
  readonly kind: TrustedWindowKind
  readonly windowId: string
  readonly origin: string
  readonly createdAt: number
}

export class SenderValidationError extends Error {
  readonly code = 'SEC_UNTRUSTED_IPC_SENDER'

  constructor(message: string) {
    super(message)
    this.name = 'SenderValidationError'
  }
}

export class TrustedWebContentsRegistry {
  readonly #records = new Map<number, TrustedWebContentsRecord>()

  register(webContents: WebContents, kind: TrustedWindowKind, origin: string): TrustedWebContentsRecord {
    const record: TrustedWebContentsRecord = Object.freeze({
      webContentsId: webContents.id,
      kind,
      windowId: randomUUID(),
      origin,
      createdAt: Date.now()
    })
    this.#records.set(webContents.id, record)
    webContents.once('destroyed', () => this.#records.delete(webContents.id))
    return record
  }

  unregister(webContentsId: number): void {
    this.#records.delete(webContentsId)
  }

  get(webContentsId: number): TrustedWebContentsRecord | undefined {
    return this.#records.get(webContentsId)
  }

  list(): readonly TrustedWebContentsRecord[] {
    return [...this.#records.values()]
  }

  assertTrustedEvent(event: IpcMainInvokeEvent | IpcMainEvent): TrustedWebContentsRecord {
    return this.assertTrustedSender(event.sender, event.senderFrame)
  }

  assertTrustedSender(sender: WebContents, frame: WebFrameMain | null): TrustedWebContentsRecord {
    const record = this.#records.get(sender.id)
    if (!record) throw new SenderValidationError('IPC sender is not a registered MarkHere window.')
    if (sender.isDestroyed()) throw new SenderValidationError('IPC sender was destroyed.')
    if (!frame || frame.isDestroyed()) throw new SenderValidationError('IPC sender frame is unavailable.')
    if (frame.parent !== null) throw new SenderValidationError('Only the top-level MarkHere frame may invoke privileged IPC.')
    if (frame.origin !== record.origin) {
      throw new SenderValidationError(`Unexpected IPC origin '${frame.origin}'.`)
    }
    return record
  }
}
