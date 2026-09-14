import { describe, expect, it } from 'vitest'
import { classifyPreviewImage } from './resource-url'

describe('classifyPreviewImage', () => {
  it('maps a relative image through markhere-resource', () => {
    const result = classifyPreviewImage('images/example.png', 'scope-id', false)
    expect(result).toEqual({
      kind: 'local',
      url: `markhere-resource://scope-id/r/${encodeURIComponent('images/example.png')}`
    })
  })

  it('blocks remote content unless explicitly allowed', () => {
    expect(classifyPreviewImage('https://example.com/a.png', 'scope', false)).toMatchObject({ kind: 'blocked' })
    expect(classifyPreviewImage('https://example.com/a.png', 'scope', true)).toMatchObject({ kind: 'remote' })
  })

  it('never permits http, javascript, protocol-relative, or absolute filesystem paths', () => {
    for (const value of ['http://example.com/a.png', 'javascript:alert(1)', '//example.com/a.png', '/etc/passwd', 'C:\\secret.png']) {
      expect(classifyPreviewImage(value, 'scope', true)).toMatchObject({ kind: 'blocked' })
    }
  })
})
