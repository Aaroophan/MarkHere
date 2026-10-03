import { describe, expect, it } from 'vitest'
import { SecurityPolicy, SECURITY_BUDGETS, classifyExternalUrl, classifyRemoteImageUrl } from './index'

describe('SecurityPolicy', () => {
  const policy = new SecurityPolicy()
  it('allows only reviewed external schemes', () => {
    expect(classifyExternalUrl('https://example.com/path').decision).toBe('allow')
    expect(classifyExternalUrl('javascript:alert(1)').decision).toBe('deny')
    expect(classifyExternalUrl('file:///c:/secret.txt').decision).toBe('deny')
  })
  it('requires explicit https remote-image policy', () => {
    expect(classifyRemoteImageUrl('https://example.com/a.png', 'block').decision).toBe('deny')
    expect(classifyRemoteImageUrl('http://example.com/a.png', 'allow-https').decision).toBe('deny')
    expect(classifyRemoteImageUrl('https://example.com/a.png', 'allow-https').decision).toBe('allow')
  })
  it('limits navigation to the application origin', () => {
    expect(policy.mayNavigate('markhere://app/index.html', 'markhere://app')).toBe(true)
    expect(policy.mayNavigate('https://example.com', 'markhere://app')).toBe(false)
  })
  it('publishes finite request budgets', () => {
    expect(SECURITY_BUDGETS.maxMarkdownBytes).toBe(32 * 1024 * 1024)
    expect(SECURITY_BUDGETS.maxConcurrentExportsPerWindow).toBeGreaterThan(0)
  })
})
