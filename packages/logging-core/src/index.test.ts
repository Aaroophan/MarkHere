import { describe, expect, it } from 'vitest'
import { redactPathForLog, redactUrlForLog, sanitizeMetadata } from './index'

describe('logging redaction', () => {
  it('redacts document and secret-like fields', () => {
    const metadata = sanitizeMetadata({ markdown: 'UNIQUE_PRIVATE_TEXT', token: 'secret', count: 2, phase: 'save' })
    expect(JSON.stringify(metadata)).not.toContain('UNIQUE_PRIVATE_TEXT')
    expect(JSON.stringify(metadata)).not.toContain('secret')
    expect(metadata?.phase).toBe('save')
  })
  it('redacts path directories and URL query/fragment', () => {
    expect(redactPathForLog('C:\\Users\\Alice\\private\\note.md')).toBe('<redacted>/note.md')
    expect(redactUrlForLog('https://example.com/path?q=secret#fragment')).toBe('https://example.com/<redacted>')
  })
})
