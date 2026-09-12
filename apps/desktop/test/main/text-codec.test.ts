import { describe, expect, it } from 'vitest'
import { decodeDocumentBytes, encodeDocumentText } from '../../src/main/documents/text-codec'

describe('document text codec', () => {
  it('accepts zero-byte Markdown', () => {
    const decoded = decodeDocumentBytes(Buffer.alloc(0))
    expect(decoded.markdown).toBe('')
    expect(decoded.textFormat.encoding).toBe('utf8')
  })

  it('detects UTF-8 BOM, CRLF, and final newline', () => {
    const decoded = decodeDocumentBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb\r\n')]))
    expect(decoded.markdown).toBe('a\r\nb\r\n')
    expect(decoded.textFormat).toMatchObject({ encoding: 'utf8-bom', lineEnding: 'crlf', hasFinalNewline: true, bom: true })
  })

  it('preserves requested line endings on encoding', () => {
    const bytes = encodeDocumentText('a\nb\n', { encoding: 'utf8', lineEnding: 'crlf', hasFinalNewline: true, bom: false })
    expect(bytes.toString('utf8')).toBe('a\r\nb\r\n')
  })
})
