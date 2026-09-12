import { describe, expect, it } from 'vitest'
import { CapabilityOwnershipRegistry } from '../../src/main/security/capability-ownership-registry'

describe('CapabilityOwnershipRegistry', () => {
  it('isolates capabilities by type and owning window webContents', () => {
    const registry = new CapabilityOwnershipRegistry()
    registry.register('document-a', 'document', 101)

    expect(registry.owns('document-a', 'document', 101)).toBe(true)
    expect(registry.owns('document-a', 'document', 202)).toBe(false)
    expect(registry.owns('document-a', 'workspace', 101)).toBe(false)
  })

  it('revokes every capability when its owning window is destroyed', () => {
    const registry = new CapabilityOwnershipRegistry()
    registry.register('document-a', 'document', 101)
    registry.register('workspace-a', 'workspace', 101)
    registry.register('document-b', 'document', 202)

    registry.revokeAllForWebContents(101)
    expect(registry.owns('document-a', 'document', 101)).toBe(false)
    expect(registry.owns('workspace-a', 'workspace', 101)).toBe(false)
    expect(registry.owns('document-b', 'document', 202)).toBe(true)
  })
})
