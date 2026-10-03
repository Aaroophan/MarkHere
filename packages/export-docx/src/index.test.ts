import { describe, expect, it } from 'vitest'
import type { ExportDocument, ExportRenderContext } from '@markhere/export-core'
import { renderDocx, verifyDocxBytes } from './index'

const document: ExportDocument = Object.freeze({
  schemaVersion: 1,
  documentId: 'doc-1' as never,
  revision: 11 as never,
  title: 'DOCX fixture',
  profile: Object.freeze({ commonMark: '0.31.2', gfmTables: true, gfmTaskLists: true, gfmStrikethrough: true, extendedAutolinks: true, frontMatter: true, math: true, mermaid: true, rawHtml: 'sanitized' }),
  diagnostics: Object.freeze([]),
  blocks: Object.freeze([
    { kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Heading', marks: [] }] },
    { kind: 'list', ordered: true, start: 1, items: [{ blocks: [{ kind: 'paragraph', children: [{ kind: 'text', text: 'Item', marks: [] }] }] }] },
    { kind: 'table', rows: [[{ header: true, children: [{ kind: 'text', text: 'A', marks: [] }] }], [{ header: false, children: [{ kind: 'text', text: 'B', marks: [] }] }]] },
    { kind: 'blockquote', blocks: [{ kind: 'paragraph', children: [{ kind: 'text', text: 'Quote', marks: [] }] }] },
    { kind: 'code-block', language: 'ts', code: 'const x = 1\nconst y = 2' },
    { kind: 'paragraph', children: [{ kind: 'image', source: './pixel.png', alt: 'pixel' }] },
    { kind: 'diagram', engine: 'mermaid', sourceText: 'graph TD\nA-->B' },
    { kind: 'math-block', sourceText: 'x^2' }
  ])
})

const options = Object.freeze({
  themeId: 'default', includeFrontMatter: false, includeTableOfContents: false,
  pageSize: 'A4' as const, orientation: 'portrait' as const, includePageNumbers: true,
  codeStyle: 'shaded' as const, diagramMode: 'png' as const, mathMode: 'text-fallback' as const
})

describe('native DOCX generation', () => {
  it('generates a structurally recognizable OOXML package', async () => {
    const imageBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))
    const context: ExportRenderContext = { document, assets: new Map([['./pixel.png', { id: 'pixel', source: './pixel.png', mimeType: 'image/png', bytes: imageBytes, width: 1, height: 1 }]]) }
    const result = await renderDocx(context, options)
    expect(verifyDocxBytes(result.bytes)).toBe(true)
    const archiveText = new TextDecoder('latin1').decode(result.bytes)
    expect(archiveText).toContain('word/document.xml')
    expect(archiveText).toContain('word/numbering.xml')
    expect(archiveText).toContain('word/styles.xml')
    expect(archiveText).toContain('word/media/')
    expect(result.diagnostics.map((item) => item.code)).toContain('DOCX_MERMAID_PNG_FALLBACK_UNAVAILABLE')
    expect(result.diagnostics.map((item) => item.code)).toContain('DOCX_MATH_TEXT_FALLBACK')
  })

  it('does not accept a generic ZIP as DOCX', () => {
    const bytes = new TextEncoder().encode(`PK\u0003\u0004${'x'.repeat(1024)}`)
    expect(verifyDocxBytes(bytes)).toBe(false)
  })
})
