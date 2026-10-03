import { describe, expect, it } from 'vitest'
import { IpcAbuseProtector, exceedsGenericIpcBudget } from '../../src/main/security/ipc-abuse-protector'
import { SECURITY_BUDGETS } from '@markhere/security-core'

describe('IPC abuse protection', () => {
  it('rejects generic oversized payloads before service handling', () => {
    expect(exceedsGenericIpcBudget('x'.repeat(SECURITY_BUDGETS.maxIpcStringBytes + 1))).toBe(true)
  })
  it('temporarily blocks a sender after repeated invalid requests', () => {
    const protector = new IpcAbuseProtector()
    const now = 10_000
    for (let i = 0; i <= SECURITY_BUDGETS.maxInvalidIpcPerWindowPerMinute; i += 1) protector.noteInvalid(42, now)
    expect(protector.isBlocked(42, now + 1)).toBe(true)
    expect(protector.isBlocked(42, now + 61_000)).toBe(false)
  })
})
