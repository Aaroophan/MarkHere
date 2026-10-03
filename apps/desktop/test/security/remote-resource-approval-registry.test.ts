import { describe, expect, it } from 'vitest'
import { RemoteResourceApprovalRegistry } from '../../src/main/security/remote-resource-approval-registry'

describe('remote resource approvals', () => {
  it('approves only exact HTTPS image URLs for the owning renderer', () => {
    const approvals = new RemoteResourceApprovalRegistry()
    expect(approvals.approve('doc-1', 7, ['https://example.com/a.png?x=1', 'http://example.com/b.png', 'javascript:alert(1)'])).toBe(1)
    expect(approvals.isApproved('https://example.com/a.png?x=1', 7)).toBe(true)
    expect(approvals.isApproved('https://example.com/a.png?x=2', 7)).toBe(false)
    expect(approvals.isApproved('https://example.com/a.png?x=1', 8)).toBe(false)
  })
  it('revokes approvals with document/window lifecycle', () => {
    const approvals = new RemoteResourceApprovalRegistry()
    approvals.approve('doc-1', 7, ['https://example.com/a.png'])
    approvals.revokeDocument('doc-1')
    expect(approvals.isApproved('https://example.com/a.png', 7)).toBe(false)
  })
})
