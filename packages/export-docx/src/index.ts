import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  PageOrientation,
  Paragraph,
  Packer,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  convertMillimetersToTwip
} from 'docx'
import type {
  DocxExportOptions,
  ExportAsset,
  ExportBlock,
  ExportInline,
  ExportRenderContext,
  ExportResultDiagnostic
} from '@markhere/export-core'

export interface DocxExportResult {
  readonly bytes: Uint8Array
  readonly diagnostics: readonly ExportResultDiagnostic[]
}

type DocxBlock = Paragraph | Table
type InlineChild = TextRun | ExternalHyperlink | ImageRun

const ORDERED_REF = 'markhere-numbered'
const BULLET_REF = 'markhere-bullets'

function plainText(inlines: readonly ExportInline[]): string {
  return inlines.map((inline) => {
    if (inline.kind === 'text') return inline.text
    if (inline.kind === 'break') return '\n'
    if (inline.kind === 'link') return plainText(inline.children)
    if (inline.kind === 'image') return inline.alt
    if (inline.kind === 'math') return inline.source
    return inline.html.replace(/<[^>]+>/gu, '')
  }).join('')
}

function safeExternalLink(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:' ? parsed.toString() : null
  } catch { return null }
}

function imageType(mimeType: string): 'png' | 'jpg' | 'gif' | 'bmp' | null {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/bmp') return 'bmp'
  return null
}

function imageSize(asset: ExportAsset): { width: number; height: number } {
  const maxWidth = 620
  const width = asset.width && asset.width > 0 ? asset.width : 560
  const height = asset.height && asset.height > 0 ? asset.height : Math.round(width * 0.625)
  if (width <= maxWidth) return { width, height }
  const scale = maxWidth / width
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) }
}

function inlineChildren(
  inlines: readonly ExportInline[],
  assets: ReadonlyMap<string, ExportAsset>,
  diagnostics: ExportResultDiagnostic[]
): InlineChild[] {
  const output: InlineChild[] = []
  for (const inline of inlines) {
    if (inline.kind === 'break') {
      output.push(new TextRun({ text: '', break: 1 }))
      continue
    }
    if (inline.kind === 'math') {
      diagnostics.push({ code: 'DOCX_MATH_TEXT_FALLBACK', severity: 'warning', message: 'Inline math is represented as source text in DOCX v1.', ...(inline.sourceRef ? { source: inline.sourceRef } : {}) })
      output.push(new TextRun({ text: inline.source, font: 'Cambria Math', italics: true }))
      continue
    }
    if (inline.kind === 'raw-html-inline') {
      diagnostics.push({ code: 'DOCX_RAW_HTML_TEXT_FALLBACK', severity: 'warning', message: 'Raw HTML is represented as plain text in DOCX.' })
      output.push(new TextRun(inline.html.replace(/<[^>]+>/gu, '')))
      continue
    }
    if (inline.kind === 'image') {
      const asset = assets.get(inline.source)
      const type = asset ? imageType(asset.mimeType) : null
      if (!asset || !type) {
        diagnostics.push({ code: 'DOCX_IMAGE_UNRESOLVED', severity: 'warning', message: `Image could not be embedded in DOCX: ${inline.source}`, ...(inline.sourceRef ? { source: inline.sourceRef } : {}) })
        output.push(new TextRun(`[Image: ${inline.alt || inline.source}]`))
        continue
      }
      output.push(new ImageRun({ data: asset.bytes, type, transformation: imageSize(asset) }))
      continue
    }
    if (inline.kind === 'link') {
      const label = plainText(inline.children) || inline.href
      const href = safeExternalLink(inline.href)
      if (href) {
        output.push(new ExternalHyperlink({
          link: href,
          children: [new TextRun({ text: label, color: '0563C1', underline: { type: UnderlineType.SINGLE } })]
        }))
      } else {
        diagnostics.push({ code: 'DOCX_LINK_TEXT_FALLBACK', severity: 'info', message: `Non-external link exported as text: ${inline.href}` })
        output.push(new TextRun(label))
      }
      continue
    }

    output.push(new TextRun({
      text: inline.text,
      ...(inline.marks.includes('bold') ? { bold: true } : {}),
      ...(inline.marks.includes('italic') ? { italics: true } : {}),
      ...(inline.marks.includes('strikethrough') ? { strike: true } : {}),
      ...(inline.marks.includes('code') ? { font: 'Consolas', shading: { fill: 'F1F5F9' } } : {})
    }))
  }
  return output
}

function headingLevel(level: number): typeof HeadingLevel[keyof typeof HeadingLevel] {
  const values = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
  return values[Math.min(5, Math.max(0, level - 1))] ?? HeadingLevel.HEADING_1
}


function blockPlainText(block: ExportBlock): string {
  if (block.kind === 'heading' || block.kind === 'paragraph') return plainText(block.children)
  if (block.kind === 'code-block') return block.code
  if (block.kind === 'diagram' || block.kind === 'math-block') return block.sourceText
  if (block.kind === 'raw-html') return block.html.replace(/<[^>]+>/gu, '')
  if (block.kind === 'front-matter' || block.kind === 'opaque') return block.sourceText
  if (block.kind === 'blockquote') return block.blocks.map(blockPlainText).join('\n')
  if (block.kind === 'list') return block.items.map((item) => item.blocks.map(blockPlainText).join(' ')).join('\n')
  if (block.kind === 'table') return block.rows.map((row) => row.map((cell) => plainText(cell.children)).join(' | ')).join('\n')
  return ''
}

function codeRuns(code: string): TextRun[] {
  const lines = code.replace(/\r\n?/gu, '\n').split('\n')
  return lines.flatMap((line, index) => [new TextRun({ text: line || ' ', font: 'Consolas', ...(index > 0 ? { break: 1 } : {}) })])
}

function paragraphFromInline(inlines: readonly ExportInline[], assets: ReadonlyMap<string, ExportAsset>, diagnostics: ExportResultDiagnostic[], options?: { readonly indentLeft?: number; readonly numbering?: { reference: string; level: number } }): Paragraph {
  return new Paragraph({
    children: inlineChildren(inlines, assets, diagnostics),
    ...(options?.indentLeft ? { indent: { left: options.indentLeft } } : {}),
    ...(options?.numbering ? { numbering: options.numbering } : {})
  })
}

function tableBlock(block: Extract<ExportBlock, { kind: 'table' }>, assets: ReadonlyMap<string, ExportAsset>, diagnostics: ExportResultDiagnostic[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: block.rows.map((row) => new TableRow({
      children: row.map((cell) => new TableCell({
        children: [new Paragraph({ children: inlineChildren(cell.children, assets, diagnostics) })],
        ...(cell.header ? { shading: { fill: 'E9EEF5' } } : {})
      }))
    }))
  })
}

function listBlocks(
  block: Extract<ExportBlock, { kind: 'list' }>,
  assets: ReadonlyMap<string, ExportAsset>,
  options: DocxExportOptions,
  diagnostics: ExportResultDiagnostic[],
  level: number
): DocxBlock[] {
  const output: DocxBlock[] = []
  const clampedLevel = Math.min(8, Math.max(0, level))
  if (block.ordered && block.start !== 1) diagnostics.push({
    code: 'DOCX_ORDERED_LIST_START_NORMALIZED',
    severity: 'warning',
    message: `Ordered list start ${block.start} is normalized to 1 by the current DOCX numbering adapter.`,
    ...(block.source ? { source: block.source } : {})
  })
  for (const item of block.items) {
    let numbered = false
    for (const child of item.blocks) {
      if (child.kind === 'paragraph' && !numbered) {
        const prefix: ExportInline[] = item.checked === undefined ? [] : [{ kind: 'text', text: item.checked ? '☑ ' : '☐ ', marks: [] }]
        output.push(paragraphFromInline([...prefix, ...child.children], assets, diagnostics, { numbering: { reference: block.ordered ? ORDERED_REF : BULLET_REF, level: clampedLevel } }))
        numbered = true
      } else if (child.kind === 'list') output.push(...listBlocks(child, assets, options, diagnostics, clampedLevel + 1))
      else output.push(...blocksToDocx([child], assets, options, diagnostics, { indentLeft: 360 * (clampedLevel + 1) }))
    }
    if (!numbered) output.push(new Paragraph({ text: item.checked === undefined ? '' : item.checked ? '☑' : '☐', numbering: { reference: block.ordered ? ORDERED_REF : BULLET_REF, level: clampedLevel } }))
  }
  return output
}

function blocksToDocx(
  blocks: readonly ExportBlock[],
  assets: ReadonlyMap<string, ExportAsset>,
  options: DocxExportOptions,
  diagnostics: ExportResultDiagnostic[],
  nested?: { readonly indentLeft?: number }
): DocxBlock[] {
  const output: DocxBlock[] = []
  for (const block of blocks) {
    if (block.kind === 'heading') output.push(new Paragraph({ heading: headingLevel(block.level), children: inlineChildren(block.children, assets, diagnostics) }))
    else if (block.kind === 'paragraph') output.push(paragraphFromInline(block.children, assets, diagnostics, nested))
    else if (block.kind === 'list') output.push(...listBlocks(block, assets, options, diagnostics, 0))
    else if (block.kind === 'table') output.push(tableBlock(block, assets, diagnostics))
    else if (block.kind === 'blockquote') {
      for (const quote of block.blocks) {
        output.push(new Paragraph({
          children: [new TextRun(blockPlainText(quote))],
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: '94A3B8', space: 8 } }
        }))
      }
    } else if (block.kind === 'code-block') {
      output.push(new Paragraph({
        style: 'MarkHereCode',
        children: codeRuns(block.code),
        ...(options.codeStyle === 'shaded' ? { shading: { fill: 'F1F5F9' } } : {})
      }))
    } else if (block.kind === 'diagram') {
      const diagramCode = options.diagramMode === 'png' ? 'DOCX_MERMAID_PNG_FALLBACK_UNAVAILABLE' : 'DOCX_MERMAID_SVG_FALLBACK_UNAVAILABLE'
      diagnostics.push({ code: diagramCode, severity: 'warning', message: `Requested Mermaid ${options.diagramMode} rendering is not safely available in DOCX v1; source text is included instead.`, ...(block.source ? { source: block.source } : {}) })
      output.push(new Paragraph({ children: [new TextRun({ text: 'Mermaid diagram source', bold: true })] }))
      output.push(new Paragraph({ style: 'MarkHereCode', children: codeRuns(block.sourceText) }))
    } else if (block.kind === 'math-block') {
      const mathCode = options.mathMode === 'image' ? 'DOCX_MATH_IMAGE_FALLBACK_UNAVAILABLE' : 'DOCX_MATH_TEXT_FALLBACK'
      diagnostics.push({ code: mathCode, severity: 'warning', message: options.mathMode === 'image' ? 'Requested math image rendering is not safely available in DOCX v1; source text is included instead.' : 'Display math is represented as source text in DOCX v1.', ...(block.source ? { source: block.source } : {}) })
      output.push(new Paragraph({ children: [new TextRun({ text: block.sourceText, font: 'Cambria Math', italics: true })] }))
    } else if (block.kind === 'thematic-break') {
      output.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8', space: 6 } } }))
    } else if (block.kind === 'raw-html') {
      diagnostics.push({ code: 'DOCX_RAW_HTML_TEXT_FALLBACK', severity: 'warning', message: 'Raw HTML is represented as plain text in DOCX.', ...(block.source ? { source: block.source } : {}) })
      output.push(new Paragraph(block.html.replace(/<[^>]+>/gu, '')))
    } else if (block.kind === 'front-matter') {
      if (options.includeFrontMatter) output.push(new Paragraph({ style: 'MarkHereCode', children: codeRuns(block.sourceText) }))
    } else {
      diagnostics.push({ code: 'DOCX_OPAQUE_TEXT_FALLBACK', severity: 'warning', message: `Unsupported Markdown token '${block.tokenType}' is represented as text in DOCX.`, ...(block.source ? { source: block.source } : {}) })
      output.push(new Paragraph({ style: 'MarkHereCode', children: codeRuns(block.sourceText) }))
    }
  }
  return output
}

function tocBlocks(context: ExportRenderContext): Paragraph[] {
  const headings = context.document.blocks.filter((block): block is Extract<ExportBlock, { kind: 'heading' }> => block.kind === 'heading')
  if (!headings.length) return []
  return [
    new Paragraph({ text: 'Contents', heading: HeadingLevel.HEADING_1 }),
    ...headings.map((heading) => new Paragraph({ text: plainText(heading.children), indent: { left: Math.max(0, heading.level - 1) * 360 } }))
  ]
}

function numberingLevels(ordered: boolean) {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : level % 2 === 0 ? '•' : '◦',
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } }
  }))
}

export async function renderDocx(context: ExportRenderContext, options: DocxExportOptions): Promise<DocxExportResult> {
  const diagnostics: ExportResultDiagnostic[] = context.document.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.sourceRange ? { source: diagnostic.sourceRange } : {})
  }))
  const title = options.documentTitle?.trim() || context.document.title || 'MarkHere Document'
  const children: DocxBlock[] = []
  if (options.includeTableOfContents) children.push(...tocBlocks(context))
  children.push(...blocksToDocx(context.document.blocks, context.assets, options, diagnostics))

  const isLandscape = options.orientation === 'landscape'
  const portrait = options.pageSize === 'Letter' ? { width: 215.9, height: 279.4 } : { width: 210, height: 297 }
  const width = convertMillimetersToTwip(isLandscape ? portrait.height : portrait.width)
  const height = convertMillimetersToTwip(isLandscape ? portrait.width : portrait.height)

  const document = new Document({
    creator: 'MarkHere',
    title,
    description: `Exported from MarkHere revision ${context.document.revision}`,
    numbering: {
      config: [
        { reference: ORDERED_REF, levels: numberingLevels(true) },
        { reference: BULLET_REF, levels: numberingLevels(false) }
      ]
    },
    styles: {
      paragraphStyles: [
        {
          id: 'MarkHereCode',
          name: 'MarkHere Code',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Consolas', size: 20 },
          paragraph: { spacing: { before: 120, after: 120 }, indent: { left: 240, right: 240 } }
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width, height, orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20), left: convertMillimetersToTwip(20) }
        }
      },
      ...(options.includePageNumbers ? {
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Page '), PageNumber.CURRENT] })] }) }
      } : {}),
      children
    }]
  })

  const bytes = new Uint8Array(await Packer.toArrayBuffer(document))
  return Object.freeze({ bytes, diagnostics: Object.freeze(diagnostics) })
}

export function verifyDocxBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength <= 512 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false
  // OOXML ZIP central-directory entry names are stored as plain bytes even when
  // their XML payloads are compressed, so these checks reject truncated or
  // generic ZIP output without parsing untrusted XML in the privileged process.
  const archiveText = new TextDecoder('latin1').decode(bytes)
  return archiveText.includes('[Content_Types].xml')
    && archiveText.includes('word/document.xml')
    && archiveText.includes('word/_rels/document.xml.rels')
}
