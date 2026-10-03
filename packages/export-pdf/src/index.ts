import type { ExportRenderContext, HtmlExportOptions, PdfExportOptions } from '@markhere/export-core'
import { renderPrintHtml, type HtmlExportResult } from '@markhere/export-html'

export interface PdfPrintToPdfOptions {
  readonly landscape: boolean
  readonly displayHeaderFooter: boolean
  readonly printBackground: boolean
  readonly pageSize: 'A4' | 'A3' | 'Letter' | 'Legal'
  readonly margins: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }
  readonly headerTemplate?: string
  readonly footerTemplate?: string
  readonly preferCSSPageSize: false
  readonly generateTaggedPDF: true
  readonly generateDocumentOutline: true
}

const mmToInches = (value: number): number => value / 25.4

function escapeTemplateText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function safeHeaderFooterTemplate(value: string): string {
  return `<div style="width:100%;font:9px sans-serif;padding:0 12mm;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeTemplateText(value)}</div>`
}


export function validatePdfOptions(options: PdfExportOptions): PdfExportOptions {
  const margin = options.marginsMm
  for (const [side, value] of [['top', margin.top], ['right', margin.right], ['bottom', margin.bottom], ['left', margin.left]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 50) throw new Error(`PDF margin '${side}' is outside the supported 0-50 mm range.`)
  }
  if (!['A4', 'A3', 'Letter', 'Legal'].includes(options.pageSize)) throw new Error('Unsupported PDF page size.')
  if (!['portrait', 'landscape'].includes(options.orientation)) throw new Error('Unsupported PDF orientation.')
  if ((options.headerTemplate?.length ?? 0) > 4096 || (options.footerTemplate?.length ?? 0) > 4096) throw new Error('PDF header/footer template is too large.')
  return options
}

export function createPdfPrintOptions(options: PdfExportOptions): PdfPrintToPdfOptions {
  validatePdfOptions(options)
  return Object.freeze({
    landscape: options.orientation === 'landscape',
    displayHeaderFooter: options.displayHeaderFooter,
    printBackground: options.printBackground,
    pageSize: options.pageSize,
    margins: Object.freeze({
      top: mmToInches(options.marginsMm.top),
      right: mmToInches(options.marginsMm.right),
      bottom: mmToInches(options.marginsMm.bottom),
      left: mmToInches(options.marginsMm.left)
    }),
    ...(options.headerTemplate ? { headerTemplate: safeHeaderFooterTemplate(options.headerTemplate) } : {}),
    ...(options.footerTemplate ? { footerTemplate: safeHeaderFooterTemplate(options.footerTemplate) } : {}),
    preferCSSPageSize: false,
    generateTaggedPDF: true,
    generateDocumentOutline: true
  })
}

export function buildPdfPrintDocument(context: ExportRenderContext, options: PdfExportOptions): HtmlExportResult {
  validatePdfOptions(options)
  const htmlOptions: Omit<HtmlExportOptions, 'imagePolicy'> = {
    ...(options.documentTitle ? { documentTitle: options.documentTitle } : {}),
    themeId: options.themeId,
    includeFrontMatter: options.includeFrontMatter,
    includeTableOfContents: options.includeTableOfContents
  }
  return renderPrintHtml(context, htmlOptions)
}

export function verifyPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 128) return false
  const decoder = new TextDecoder('latin1')
  const head = decoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 16)))
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.byteLength - 4096)))
  if (!head.startsWith('%PDF-') || !tail.includes('%%EOF') || !/\/Root\b/u.test(tail)) return false

  // Validate that startxref points inside the artifact and lands on either a
  // classic xref table or an indirect object (xref-stream form). This is an
  // inexpensive privileged-process corruption gate; semantic/page verification
  // remains the Issue-10 parser/rendered-page suite.
  const match = /startxref\s+(\d+)\s+%%EOF/u.exec(tail)
  const offset = match?.[1] ? Number(match[1]) : Number.NaN
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= bytes.byteLength) return false
  const atXref = decoder.decode(bytes.subarray(offset, Math.min(bytes.byteLength, offset + 96))).trimStart()
  return atXref.startsWith('xref') || /^\d+\s+\d+\s+obj\b/u.test(atXref)
}
