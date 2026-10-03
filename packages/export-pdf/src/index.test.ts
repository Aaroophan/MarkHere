import { describe, expect, it } from 'vitest'
import { createPdfPrintOptions, validatePdfOptions, verifyPdfBytes } from './index'

const options = Object.freeze({
  themeId: 'default',
  includeFrontMatter: false,
  includeTableOfContents: false,
  pageSize: 'A4' as const,
  orientation: 'landscape' as const,
  marginsMm: { top: 12.7, right: 25.4, bottom: 12.7, left: 25.4 },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<script>alert(1)</script>Header',
  footerTemplate: 'Footer'
})

describe('PDF print options and structural verification', () => {
  it('converts millimetres to Electron printToPDF inches and escapes header/footer text', () => {
    const converted = createPdfPrintOptions(options)
    expect(converted.landscape).toBe(true)
    expect(converted.margins.left).toBeCloseTo(1)
    expect(converted.margins.top).toBeCloseTo(0.5)
    expect(converted.headerTemplate).toContain('&lt;script&gt;')
    expect(converted.headerTemplate).not.toContain('<script>')
  })

  it('rejects unsafe numeric bounds', () => {
    expect(() => validatePdfOptions({ ...options, marginsMm: { ...options.marginsMm, top: 51 } })).toThrow()
  })

  it('rejects a magic-byte-only fake PDF and accepts a minimally structural sample', () => {
    const encoder = new TextEncoder()
    expect(verifyPdfBytes(encoder.encode('%PDF-1.7\n%%EOF'))).toBe(false)
    const body = `%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 1 >> endobj\n${' '.repeat(128)}\n`
    const offset = encoder.encode(body).byteLength
    const structural = `${body}xref\n0 3\n0000000000 65535 f \ntrailer << /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`
    expect(verifyPdfBytes(encoder.encode(structural))).toBe(true)
  })
})
