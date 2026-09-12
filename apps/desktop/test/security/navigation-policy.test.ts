import { describe, expect, it } from 'vitest'
import { isAllowedApplicationNavigation } from '../../src/main/security/navigation-policy'

describe('application navigation policy', () => {
  it('allows only the expected application protocol and host', () => {
    expect(isAllowedApplicationNavigation('markhere://app/index.html', 'markhere://app')).toBe(true)
    expect(isAllowedApplicationNavigation('markhere://app/settings', 'markhere://app')).toBe(true)
    expect(isAllowedApplicationNavigation('markhere://evil/index.html', 'markhere://app')).toBe(false)
    expect(isAllowedApplicationNavigation('https://example.com', 'markhere://app')).toBe(false)
    expect(isAllowedApplicationNavigation('javascript:alert(1)', 'markhere://app')).toBe(false)
  })

  it('supports a development HTTP origin without widening it', () => {
    expect(isAllowedApplicationNavigation('http://localhost:5173/src/main.ts', 'http://localhost:5173')).toBe(true)
    expect(isAllowedApplicationNavigation('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isAllowedApplicationNavigation('https://localhost:5173/', 'http://localhost:5173')).toBe(false)
  })
})
