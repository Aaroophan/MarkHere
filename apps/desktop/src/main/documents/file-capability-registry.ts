import { randomUUID } from 'node:crypto'
import type { OpenedVia } from '@markhere/document-model'
import { CapabilityOwnershipRegistry } from '../security/capability-ownership-registry'
import type { PathIdentity } from './path-identity'

export type FilePermission = 'read' | 'write' | 'stat' | 'reveal' | 'trash' | 'rename'

export interface FileCapabilityRecord {
  readonly id: string
  readonly documentId: string
  readonly ownerWebContentsId: number
  readonly path: PathIdentity
  readonly permissions: ReadonlySet<FilePermission>
  readonly openedVia: OpenedVia
  readonly createdAt: number
}

export class FileCapabilityRegistry {
  readonly #records = new Map<string, FileCapabilityRecord>()
  readonly #ownership: CapabilityOwnershipRegistry

  constructor(ownership: CapabilityOwnershipRegistry) {
    this.#ownership = ownership
  }

  create(input: Omit<FileCapabilityRecord, 'id' | 'createdAt' | 'permissions'> & { writable: boolean }): FileCapabilityRecord {
    const id = input.documentId || randomUUID()
    const permissions = new Set<FilePermission>(['read', 'stat', 'reveal'])
    if (input.writable) {
      permissions.add('write')
      permissions.add('trash')
      permissions.add('rename')
    }
    const record: FileCapabilityRecord = Object.freeze({
      id,
      documentId: input.documentId,
      ownerWebContentsId: input.ownerWebContentsId,
      path: input.path,
      permissions,
      openedVia: input.openedVia,
      createdAt: Date.now()
    })
    this.#records.set(input.documentId, record)
    this.#ownership.register(input.documentId, 'document', input.ownerWebContentsId)
    return record
  }



  listForWebContents(ownerWebContentsId: number): readonly FileCapabilityRecord[] {
    return [...this.#records.values()].filter((record) => record.ownerWebContentsId === ownerWebContentsId)
  }

  find(documentId: string): FileCapabilityRecord | undefined {
    return this.#records.get(documentId)
  }

  get(documentId: string, ownerWebContentsId: number, operation: FilePermission): FileCapabilityRecord {
    const record = this.#records.get(documentId)
    if (!record || record.ownerWebContentsId !== ownerWebContentsId || !record.permissions.has(operation)) {
      throw new Error('Document capability does not authorize this operation.')
    }
    return record
  }

  replacePath(documentId: string, ownerWebContentsId: number, path: PathIdentity, writable: boolean, openedVia: OpenedVia = 'dialog'): FileCapabilityRecord {
    this.revoke(documentId)
    return this.create({ documentId, ownerWebContentsId, path, writable, openedVia })
  }

  revoke(documentId: string): void {
    this.#records.delete(documentId)
    this.#ownership.revoke(documentId)
  }

  revokeAllForWebContents(ownerWebContentsId: number): readonly string[] {
    const revoked: string[] = []
    for (const [documentId, record] of this.#records) {
      if (record.ownerWebContentsId === ownerWebContentsId) { this.revoke(documentId); revoked.push(documentId) }
    }
    return revoked
  }
}
