import { describe, expect, it } from 'vitest'
import { classifyExternalProtocol, classifyExternalUrl } from './index'

describe('external URL security policy', () => {
  it('allows only normalized HTTPS and mailto destinations', () => {
    expect(classifyExternalUrl('https://example.com/docs').decision).toBe('allow')
    expect(classifyExternalUrl('mailto:person@example.com').decision).toBe('allow')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///C:/Windows/System32',
    'vbscript:msgbox(1)',
    'shell:AppsFolder'
  ])('blocks dangerous or unreviewed scheme %s', (url) => {
    expect(classifyExternalUrl(url).decision).toBe('deny')
  })

  it('rejects ambiguous, credentialed, and control-character input', () => {
    expect(classifyExternalUrl(' https://example.com').decision).toBe('deny')
    expect(classifyExternalUrl('https://user:secret@example.com/').decision).toBe('deny')
    expect(classifyExternalUrl('https://example.com/%zz').decision).toBe('deny')
    expect(classifyExternalUrl('mailto:a@example.com?subject=x%0D%0ABcc:y@example.com').decision).toBe('deny')
  })

  it('retains the simple protocol classifier for non-authoritative callers', () => {
    expect(classifyExternalProtocol('https:')).toBe('allow')
    expect(classifyExternalProtocol('mailto:')).toBe('allow')
    expect(classifyExternalProtocol('file:')).toBe('deny')
  })
})
