import { randomUUID } from 'node:crypto'

export type SelectionTokenKind = 'document-open' | 'workspace-open' | 'document-save' | 'export-target'

export interface SelectionTokenRecord {
  readonly token: string
  readonly kind: SelectionTokenKind
  readonly path: string
  readonly ownerWebContentsId: number
  readonly issuedAt: number
  readonly expiresAt: number
}

export class SelectionTokenStore {
  readonly #tokens = new Map<string, SelectionTokenRecord>()
  readonly #ttlMs: number

  constructor(ttlMs = 2 * 60 * 1000) {
    this.#ttlMs = ttlMs
  }

  issue(kind: SelectionTokenKind, path: string, ownerWebContentsId: number): SelectionTokenRecord {
    this.pruneExpired()
    const issuedAt = Date.now()
    const record: SelectionTokenRecord = Object.freeze({
      token: randomUUID(),
      kind,
      path,
      ownerWebContentsId,
      issuedAt,
      expiresAt: issuedAt + this.#ttlMs
    })
    this.#tokens.set(record.token, record)
    return record
  }

  owns(token: string, expectedKind: SelectionTokenKind, ownerWebContentsId: number): boolean {
    this.pruneExpired()
    const record = this.#tokens.get(token)
    return !!record && record.kind === expectedKind && record.ownerWebContentsId === ownerWebContentsId
  }

  consume(token: string, expectedKind: SelectionTokenKind, ownerWebContentsId: number): SelectionTokenRecord {
    this.pruneExpired()
    const record = this.#tokens.get(token)
    this.#tokens.delete(token)
    if (!record || record.kind !== expectedKind || record.ownerWebContentsId !== ownerWebContentsId) {
      throw new Error('Selection token is invalid, expired, wrong-kind, or owned by another window.')
    }
    return record
  }

  revokeAllForWebContents(ownerWebContentsId: number): void {
    for (const [token, record] of this.#tokens) {
      if (record.ownerWebContentsId === ownerWebContentsId) this.#tokens.delete(token)
    }
  }

  pruneExpired(now = Date.now()): void {
    for (const [token, record] of this.#tokens) {
      if (record.expiresAt <= now) this.#tokens.delete(token)
    }
  }
}
