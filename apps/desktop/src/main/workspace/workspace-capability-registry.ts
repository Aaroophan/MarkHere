import { randomUUID } from 'node:crypto'
import type { CapabilityOwnershipRegistry } from '../security/capability-ownership-registry'

export interface WorkspaceCapabilityRecord {
  readonly workspaceId: string
  readonly ownerWebContentsId: number
  readonly displayPath: string
  readonly canonicalRoot: string
  readonly createdAt: number
}

export class WorkspaceCapabilityRegistry {
  readonly #records = new Map<string, WorkspaceCapabilityRecord>()
  readonly #ownership: CapabilityOwnershipRegistry

  constructor(ownership: CapabilityOwnershipRegistry) { this.#ownership = ownership }

  create(input: Omit<WorkspaceCapabilityRecord, 'workspaceId' | 'createdAt'>): WorkspaceCapabilityRecord {
    const workspaceId = randomUUID()
    const record = Object.freeze({ workspaceId, ...input, createdAt: Date.now() })
    this.#records.set(workspaceId, record)
    this.#ownership.register(workspaceId, 'workspace', input.ownerWebContentsId)
    return record
  }

  get(workspaceId: string, ownerWebContentsId: number): WorkspaceCapabilityRecord {
    const record = this.#records.get(workspaceId)
    if (!record || record.ownerWebContentsId !== ownerWebContentsId) throw new Error('Workspace capability is not owned by the requesting window.')
    return record
  }

  find(workspaceId: string): WorkspaceCapabilityRecord | undefined { return this.#records.get(workspaceId) }

  revoke(workspaceId: string): void {
    this.#records.delete(workspaceId)
    this.#ownership.revoke(workspaceId)
  }

  revokeAllForWebContents(ownerWebContentsId: number): readonly string[] {
    const revoked: string[] = []
    for (const [workspaceId, record] of this.#records) {
      if (record.ownerWebContentsId === ownerWebContentsId) { this.revoke(workspaceId); revoked.push(workspaceId) }
    }
    return revoked
  }
}
