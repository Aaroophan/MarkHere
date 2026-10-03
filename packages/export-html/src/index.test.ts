import { describe, expect, it } from 'vitest'
import type { DocumentId, DocumentRevision, ExportJobId } from '@markhere/document-model'
import { buildExportDocument, createExportSnapshot, defaultCapabilityProfile, type ExportRenderContext } from '@markhere/export-core'
import { renderPrintHtml, renderStandaloneHtml } from './index'

function context(markdown: string): ExportRenderContext {
  const snapshot = createExportSnapshot({
    jobId: '00000000-0000-4000-8000-000000000007' as ExportJobId,
    documentId: '00000000-0000-4000-8000-000000000001' as DocumentId,
    revision: 7 as DocumentRevision,
    markdown,
    format: 'html',
    title: 'HTML <fixture>',
    textFormat: { encoding: 'utf-8', lineEnding: 'lf', hasFinalNewline: true, bom: false },
    capabilityProfile: defaultCapabilityProfile()
  })
  return { document: buildExportDocument(snapshot), assets: new Map() }
}

const baseOptions = Object.freeze({ themeId: 'default', includeFrontMatter: false, includeTableOfContents: true, imagePolicy: 'embed-local' as const })

describe('standalone HTML export', () => {
  it('emits a browser-standalone UTF-8 document from the semantic IR', () => {
    const result = renderStandaloneHtml(context('# Hello\n\nParagraph.'), baseOptions)
    expect(result.html).toMatch(/^<!doctype html>/iu)
    expect(result.html).toContain('<meta charset="utf-8">')
    expect(result.html).toContain('<h1')
    expect(result.html).toContain('Hello')
    expect(result.html).not.toContain('contenteditable')
  })

  it('sanitizes raw HTML and blocks executable URL/event-handler content', () => {
    const result = renderStandaloneHtml(context('<p onclick="alert(1)">safe <a href="javascript:alert(1)">link</a></p>\n\n<script>alert(1)</script>'), baseOptions)
    expect(result.html).toContain('safe')
    expect(result.html).not.toMatch(/onclick\s*=/iu)
    expect(result.html).not.toMatch(/javascript:/iu)
    expect(result.html).not.toMatch(/<script\b/iu)
  })


  it('embeds resolved local raster assets and reports Mermaid fallback explicitly', () => {
    const base = context('![pixel](./pixel.png)\n\n```mermaid\ngraph TD\nA-->B\n```')
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))
    const result = renderStandaloneHtml({ ...base, assets: new Map([['./pixel.png', { id: 'pixel', source: './pixel.png', mimeType: 'image/png', bytes, width: 1, height: 1 }]]) }, baseOptions)
    expect(result.html).toContain('data:image/png;base64,')
    expect(result.diagnostics.map((item) => item.code)).toContain('EXPORT_MERMAID_SOURCE_FALLBACK')
  })

  it('uses the same clean representation for print while prohibiting remote image fetches', () => {
    const result = renderPrintHtml(context('![remote](https://example.com/image.png)'), {
      themeId: 'default', includeFrontMatter: false, includeTableOfContents: false
    })
    expect(result.html).toContain("img-src data:;")
    expect(result.html).not.toContain("img-src data: https:;")
  })
})
