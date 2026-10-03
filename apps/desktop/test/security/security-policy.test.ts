import { describe, expect, it } from 'vitest'
import { SecurityPolicy } from '@markhere/security-core'

describe('product security policy', () => {
  const policy = new SecurityPolicy()
  it('denies arbitrary windows and navigation', () => {
    expect(policy.mayCreateWindow()).toBe(false)
    expect(policy.mayNavigate('https://example.com', 'markhere://app')).toBe(false)
  })
  it('redacts sensitive URL components from logs', () => {
    expect(policy.redactUrl('https://example.com/private?q=token#x')).toBe('https://example.com/<redacted>')
  })
})
