export type CapabilityKind = 'document' | 'workspace' | 'resource' | 'selection' | 'export-job'

interface CapabilityOwner {
  readonly kind: CapabilityKind
  readonly ownerWebContentsId: number
  readonly createdAt: number
}

export class CapabilityOwnershipRegistry {
  readonly #owners = new Map<string, CapabilityOwner>()

  register(capabilityId: string, kind: CapabilityKind, ownerWebContentsId: number): void {
    this.#owners.set(capabilityId, { kind, ownerWebContentsId, createdAt: Date.now() })
  }

  owns(capabilityId: string, kind: CapabilityKind, ownerWebContentsId: number): boolean {
    const owner = this.#owners.get(capabilityId)
    return !!owner && owner.kind === kind && owner.ownerWebContentsId === ownerWebContentsId
  }

  assertOwned(capabilityId: string, kind: CapabilityKind, ownerWebContentsId: number): void {
    const owner = this.#owners.get(capabilityId)
    if (!owner || owner.kind !== kind || owner.ownerWebContentsId !== ownerWebContentsId) {
      throw new Error(`Capability '${kind}' is not owned by the requesting window.`)
    }
  }

  revoke(capabilityId: string): void {
    this.#owners.delete(capabilityId)
  }

  revokeAllForWebContents(webContentsId: number): void {
    for (const [id, owner] of this.#owners) {
      if (owner.ownerWebContentsId === webContentsId) this.#owners.delete(id)
    }
  }
}
