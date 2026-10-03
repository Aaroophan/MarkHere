import type { DocumentId, DocumentRevision, ExportJobId, TextFormatMetadata } from '@markhere/document-model'
import {
  MARKHERE_MARKDOWN_PROFILE,
  parseMarkdown,
  type MarkdownCapabilityProfile,
  type MarkdownDiagnostic,
  type MarkdownNode,
  type MarkdownSourceRange
} from '@markhere/markdown-engine'

export type ExportFormat = 'html' | 'pdf' | 'docx'
export type ExportStatus =
  | 'queued'
  | 'preparing'
  | 'resolving-assets'
  | 'rendering'
  | 'writing'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface ExportProgress {
  readonly phase: 'preparing' | 'assets' | 'rendering' | 'packaging' | 'writing' | 'finishing'
  readonly completed?: number
  readonly total?: number
  readonly percent?: number
  readonly messageKey?: string
}

export interface ExportSnapshot {
  readonly jobId: ExportJobId
  readonly documentId: DocumentId
  readonly revision: DocumentRevision
  readonly markdown: string
  readonly format: ExportFormat
  readonly title: string
  readonly textFormat: TextFormatMetadata
  readonly capabilityProfile: MarkdownCapabilityProfile
  readonly resourceScopeId?: string
  readonly capturedAt: string
}

export interface ExportSourceRef {
  readonly startLine: number
  readonly endLine: number
}

export type ExportTextMark = 'bold' | 'italic' | 'strikethrough' | 'code'

export interface ExportTextRun {
  readonly kind: 'text'
  readonly text: string
  readonly marks: readonly ExportTextMark[]
  readonly source?: ExportSourceRef
}

export interface ExportBreak {
  readonly kind: 'break'
  readonly hard: boolean
}

export interface ExportLink {
  readonly kind: 'link'
  readonly href: string
  readonly title?: string
  readonly children: readonly ExportInline[]
  readonly source?: ExportSourceRef
}

export interface ExportImage {
  readonly kind: 'image'
  readonly source: string
  readonly alt: string
  readonly title?: string
  readonly sourceRef?: ExportSourceRef
}

export interface ExportInlineMath {
  readonly kind: 'math'
  readonly source: string
  readonly display: false
  readonly sourceRef?: ExportSourceRef
}

export interface ExportRawHtmlInline {
  readonly kind: 'raw-html-inline'
  readonly html: string
  readonly sourceRef?: ExportSourceRef
}

export type ExportInline = ExportTextRun | ExportBreak | ExportLink | ExportImage | ExportInlineMath | ExportRawHtmlInline

export interface ExportHeading {
  readonly kind: 'heading'
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly id?: string
  readonly children: readonly ExportInline[]
  readonly source?: ExportSourceRef
}

export interface ExportParagraph {
  readonly kind: 'paragraph'
  readonly children: readonly ExportInline[]
  readonly source?: ExportSourceRef
}

export interface ExportListItem {
  readonly blocks: readonly ExportBlock[]
  readonly checked?: boolean
  readonly source?: ExportSourceRef
}

export interface ExportList {
  readonly kind: 'list'
  readonly ordered: boolean
  readonly start: number
  readonly items: readonly ExportListItem[]
  readonly source?: ExportSourceRef
}

export interface ExportBlockquote {
  readonly kind: 'blockquote'
  readonly blocks: readonly ExportBlock[]
  readonly source?: ExportSourceRef
}

export interface ExportTableCell {
  readonly header: boolean
  readonly children: readonly ExportInline[]
}

export interface ExportTable {
  readonly kind: 'table'
  readonly rows: readonly (readonly ExportTableCell[])[]
  readonly source?: ExportSourceRef
}

export interface ExportCodeBlock {
  readonly kind: 'code-block'
  readonly language?: string
  readonly code: string
  readonly source?: ExportSourceRef
}

export interface ExportDiagram {
  readonly kind: 'diagram'
  readonly engine: 'mermaid'
  readonly sourceText: string
  readonly source?: ExportSourceRef
}

export interface ExportMathBlock {
  readonly kind: 'math-block'
  readonly sourceText: string
  readonly source?: ExportSourceRef
}

export interface ExportThematicBreak {
  readonly kind: 'thematic-break'
  readonly source?: ExportSourceRef
}

export interface ExportRawHtmlBlock {
  readonly kind: 'raw-html'
  readonly html: string
  readonly source?: ExportSourceRef
}

export interface ExportFrontMatter {
  readonly kind: 'front-matter'
  readonly sourceText: string
  readonly source?: ExportSourceRef
}

export interface ExportOpaqueBlock {
  readonly kind: 'opaque'
  readonly tokenType: string
  readonly sourceText: string
  readonly source?: ExportSourceRef
}

export type ExportBlock =
  | ExportHeading
  | ExportParagraph
  | ExportList
  | ExportBlockquote
  | ExportTable
  | ExportCodeBlock
  | ExportDiagram
  | ExportMathBlock
  | ExportThematicBreak
  | ExportRawHtmlBlock
  | ExportFrontMatter
  | ExportOpaqueBlock

export interface ExportDocument {
  readonly schemaVersion: 1
  readonly documentId: DocumentId
  readonly revision: DocumentRevision
  readonly title: string
  readonly profile: MarkdownCapabilityProfile
  readonly blocks: readonly ExportBlock[]
  readonly diagnostics: readonly MarkdownDiagnostic[]
}

export interface ExportAsset {
  readonly id: string
  readonly source: string
  readonly mimeType: string
  readonly bytes: Uint8Array
  readonly width?: number
  readonly height?: number
}

export interface ExportResultDiagnostic {
  readonly code: string
  readonly severity: 'info' | 'warning' | 'error'
  readonly message: string
  readonly source?: ExportSourceRef
}

export interface ExportRenderContext {
  readonly document: ExportDocument
  readonly assets: ReadonlyMap<string, ExportAsset>
}

export interface CommonExportOptions {
  readonly documentTitle?: string
  readonly themeId: string
  readonly includeFrontMatter: boolean
  readonly includeTableOfContents: boolean
}

export interface HtmlExportOptions extends CommonExportOptions {
  readonly imagePolicy: 'embed-local' | 'reference'
}

export interface PdfExportOptions extends CommonExportOptions {
  readonly pageSize: 'A4' | 'A3' | 'Letter' | 'Legal'
  readonly orientation: 'portrait' | 'landscape'
  readonly marginsMm: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
  readonly printBackground: boolean
  readonly displayHeaderFooter: boolean
  readonly headerTemplate?: string
  readonly footerTemplate?: string
}

export interface DocxExportOptions extends CommonExportOptions {
  readonly pageSize: 'A4' | 'Letter'
  readonly orientation: 'portrait' | 'landscape'
  readonly includePageNumbers: boolean
  readonly codeStyle: 'shaded' | 'plain'
  readonly diagramMode: 'svg-if-compatible' | 'png'
  readonly mathMode: 'image' | 'text-fallback'
}

export function createExportSnapshot(input: Omit<ExportSnapshot, 'capturedAt'>): ExportSnapshot {
  return Object.freeze({
    ...input,
    markdown: `${input.markdown}`,
    title: `${input.title}`,
    capabilityProfile: Object.freeze({ ...input.capabilityProfile }),
    textFormat: Object.freeze({ ...input.textFormat }),
    capturedAt: new Date().toISOString()
  })
}

function sourceRef(range?: MarkdownSourceRange): ExportSourceRef | undefined {
  return range ? Object.freeze({ startLine: range.startLine, endLine: range.endLine }) : undefined
}

function textRun(text: string, marks: readonly ExportTextMark[], source?: ExportSourceRef): ExportTextRun {
  return Object.freeze({ kind: 'text', text, marks: Object.freeze([...marks]), ...(source ? { source } : {}) })
}

function inlineText(nodes: readonly ExportInline[]): string {
  return nodes.map((node) => {
    if (node.kind === 'text') return node.text
    if (node.kind === 'break') return '\n'
    if (node.kind === 'link') return inlineText(node.children)
    if (node.kind === 'image') return node.alt
    if (node.kind === 'math') return node.source
    return node.html.replace(/<[^>]+>/g, '')
  }).join('')
}

function parseInlines(nodes: readonly MarkdownNode[], inherited: readonly ExportTextMark[] = []): readonly ExportInline[] {
  const output: ExportInline[] = []
  let index = 0

  const parseUntil = (stopType?: string, marks: readonly ExportTextMark[] = inherited): readonly ExportInline[] => {
    const nested: ExportInline[] = []
    while (index < nodes.length) {
      const node = nodes[index]
      if (!node) { index += 1; continue }
      if (stopType && node.type === stopType) { index += 1; break }
      index += 1
      const source = sourceRef(node.sourceRange)
      if (node.type === 'text') nested.push(textRun(node.content, marks, source))
      else if (node.type === 'code_inline') nested.push(textRun(node.content, [...marks, 'code'], source))
      else if (node.type === 'softbreak') nested.push(Object.freeze({ kind: 'break', hard: false }))
      else if (node.type === 'hardbreak') nested.push(Object.freeze({ kind: 'break', hard: true }))
      else if (node.type === 'strong_open') nested.push(...parseUntil('strong_close', [...marks, 'bold']))
      else if (node.type === 'em_open') nested.push(...parseUntil('em_close', [...marks, 'italic']))
      else if (node.type === 's_open') nested.push(...parseUntil('s_close', [...marks, 'strikethrough']))
      else if (node.type === 'link_open') {
        const href = node.attrs.href ?? node.attrs['data-mh-href'] ?? ''
        const title = node.attrs.title
        const children = parseUntil('link_close', marks)
        nested.push(Object.freeze({ kind: 'link', href, ...(title ? { title } : {}), children, ...(source ? { source } : {}) }))
      } else if (node.type === 'image') {
        const alt = node.content || node.attrs.alt || (node.children ? inlineText(parseInlines(node.children, marks)) : '')
        const title = node.attrs.title
        nested.push(Object.freeze({
          kind: 'image',
          source: node.attrs.src ?? '',
          alt,
          ...(title ? { title } : {}),
          ...(source ? { sourceRef: source } : {})
        }))
      } else if (node.type === 'math_inline') {
        nested.push(Object.freeze({ kind: 'math', source: node.content, display: false, ...(source ? { sourceRef: source } : {}) }))
      } else if (node.type === 'html_inline') {
        nested.push(Object.freeze({ kind: 'raw-html-inline', html: node.content, ...(source ? { sourceRef: source } : {}) }))
      } else if (node.type === 'task_checkbox') {
        // List-level checked state is preserved on the list item. Do not emit
        // a second checkbox into inline content.
      } else if (node.content) nested.push(textRun(node.content, marks, source))
      else if (node.children?.length) nested.push(...parseInlines(node.children, marks))
    }
    return Object.freeze(nested)
  }

  output.push(...parseUntil(undefined, inherited))
  return Object.freeze(output)
}

function findInline(nodes: readonly MarkdownNode[], from: number, until: string): { readonly children: readonly ExportInline[]; readonly next: number } {
  let index = from
  while (index < nodes.length && nodes[index]?.type !== until) {
    const node = nodes[index]
    if (node?.type === 'inline') return { children: parseInlines(node.children ?? []), next: index + 1 }
    index += 1
  }
  return { children: Object.freeze([]), next: index }
}

function parseTable(nodes: readonly MarkdownNode[], start: number): { readonly block: ExportTable; readonly next: number } {
  const opener = nodes[start]
  const rows: ExportTableCell[][] = []
  let currentRow: ExportTableCell[] | null = null
  let headerRegion = false
  let index = start + 1
  while (index < nodes.length) {
    const node = nodes[index]
    if (!node) { index += 1; continue }
    if (node.type === 'table_close') { index += 1; break }
    if (node.type === 'thead_open') headerRegion = true
    else if (node.type === 'thead_close') headerRegion = false
    else if (node.type === 'tr_open') currentRow = []
    else if (node.type === 'tr_close') { if (currentRow) rows.push(currentRow); currentRow = null }
    else if ((node.type === 'th_open' || node.type === 'td_open') && currentRow) {
      const found = findInline(nodes, index + 1, node.type === 'th_open' ? 'th_close' : 'td_close')
      currentRow.push(Object.freeze({ header: headerRegion || node.type === 'th_open', children: found.children }))
    }
    index += 1
  }
  const source = sourceRef(opener?.sourceRange)
  return { block: Object.freeze({ kind: 'table', rows: Object.freeze(rows.map((row) => Object.freeze(row))), ...(source ? { source } : {}) }), next: index }
}

function parseBlocks(nodes: readonly MarkdownNode[], start = 0, stopType?: string): { readonly blocks: readonly ExportBlock[]; readonly next: number } {
  const blocks: ExportBlock[] = []
  let index = start
  while (index < nodes.length) {
    const node = nodes[index]
    if (!node) { index += 1; continue }
    if (stopType && node.type === stopType) return { blocks: Object.freeze(blocks), next: index + 1 }
    const source = sourceRef(node.sourceRange)

    if (node.type === 'heading_open') {
      const found = findInline(nodes, index + 1, 'heading_close')
      const levelNumber = Math.min(6, Math.max(1, Number.parseInt(node.tag.slice(1), 10) || 1)) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push(Object.freeze({ kind: 'heading', level: levelNumber, ...(node.attrs.id ? { id: node.attrs.id } : {}), children: found.children, ...(source ? { source } : {}) }))
      while (index < nodes.length && nodes[index]?.type !== 'heading_close') index += 1
      index += 1
      continue
    }

    if (node.type === 'paragraph_open') {
      const found = findInline(nodes, index + 1, 'paragraph_close')
      blocks.push(Object.freeze({ kind: 'paragraph', children: found.children, ...(source ? { source } : {}) }))
      while (index < nodes.length && nodes[index]?.type !== 'paragraph_close') index += 1
      index += 1
      continue
    }

    if (node.type === 'bullet_list_open' || node.type === 'ordered_list_open') {
      const ordered = node.type === 'ordered_list_open'
      const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close'
      const items: ExportListItem[] = []
      let cursor = index + 1
      while (cursor < nodes.length && nodes[cursor]?.type !== closeType) {
        const itemOpen = nodes[cursor]
        if (itemOpen?.type !== 'list_item_open') { cursor += 1; continue }
        const parsed = parseBlocks(nodes, cursor + 1, 'list_item_close')
        const checkedRaw = itemOpen.attrs['data-mh-task']
        items.push(Object.freeze({
          blocks: parsed.blocks,
          ...(checkedRaw ? { checked: checkedRaw === 'checked' } : {}),
          ...(itemOpen.sourceRange ? { source: sourceRef(itemOpen.sourceRange)! } : {})
        }))
        cursor = parsed.next
      }
      blocks.push(Object.freeze({
        kind: 'list',
        ordered,
        start: ordered ? Math.max(1, Number.parseInt(node.attrs.start ?? '1', 10) || 1) : 1,
        items: Object.freeze(items),
        ...(source ? { source } : {})
      }))
      index = cursor + 1
      continue
    }

    if (node.type === 'blockquote_open') {
      const parsed = parseBlocks(nodes, index + 1, 'blockquote_close')
      blocks.push(Object.freeze({ kind: 'blockquote', blocks: parsed.blocks, ...(source ? { source } : {}) }))
      index = parsed.next
      continue
    }

    if (node.type === 'table_open') {
      const parsed = parseTable(nodes, index)
      blocks.push(parsed.block)
      index = parsed.next
      continue
    }

    if (node.type === 'fence') {
      const language = node.info.trim().split(/\s+/u)[0] || undefined
      if (language?.toLocaleLowerCase('en-US') === 'mermaid') {
        blocks.push(Object.freeze({ kind: 'diagram', engine: 'mermaid', sourceText: node.content, ...(source ? { source } : {}) }))
      } else {
        blocks.push(Object.freeze({ kind: 'code-block', ...(language ? { language } : {}), code: node.content, ...(source ? { source } : {}) }))
      }
      index += 1
      continue
    }

    if (node.type === 'code_block') {
      blocks.push(Object.freeze({ kind: 'code-block', code: node.content, ...(source ? { source } : {}) }))
      index += 1
      continue
    }

    if (node.type === 'math_block') {
      blocks.push(Object.freeze({ kind: 'math-block', sourceText: node.content, ...(source ? { source } : {}) }))
      index += 1
      continue
    }

    if (node.type === 'hr') {
      blocks.push(Object.freeze({ kind: 'thematic-break', ...(source ? { source } : {}) }))
      index += 1
      continue
    }

    if (node.type === 'html_block') {
      blocks.push(Object.freeze({ kind: 'raw-html', html: node.content, ...(source ? { source } : {}) }))
      index += 1
      continue
    }

    if (node.type === 'front_matter') {
      blocks.push(Object.freeze({ kind: 'front-matter', sourceText: node.content, ...(source ? { source } : {}) }))
      index += 1
      continue
    }

    if (node.nesting === 0 && node.content) {
      blocks.push(Object.freeze({ kind: 'opaque', tokenType: node.type, sourceText: node.content, ...(source ? { source } : {}) }))
    }
    index += 1
  }
  return { blocks: Object.freeze(blocks), next: index }
}

export function buildExportDocument(snapshot: ExportSnapshot): ExportDocument {
  const parsed = parseMarkdown({ markdown: snapshot.markdown, revision: snapshot.revision, profile: snapshot.capabilityProfile })
  const blocks = parseBlocks(parsed.tree).blocks
  return Object.freeze({
    schemaVersion: 1,
    documentId: snapshot.documentId,
    revision: snapshot.revision,
    title: snapshot.title,
    profile: parsed.profile,
    blocks,
    diagnostics: parsed.diagnostics
  })
}

export function defaultCapabilityProfile(): MarkdownCapabilityProfile {
  return MARKHERE_MARKDOWN_PROFILE
}

export function collectImageSources(document: ExportDocument): readonly string[] {
  const values = new Set<string>()
  const visitInline = (inline: ExportInline): void => {
    if (inline.kind === 'image' && inline.source) values.add(inline.source)
    else if (inline.kind === 'link') inline.children.forEach(visitInline)
  }
  const visitBlock = (block: ExportBlock): void => {
    if (block.kind === 'heading' || block.kind === 'paragraph') block.children.forEach(visitInline)
    else if (block.kind === 'list') block.items.forEach((item) => item.blocks.forEach(visitBlock))
    else if (block.kind === 'blockquote') block.blocks.forEach(visitBlock)
    else if (block.kind === 'table') block.rows.forEach((row) => row.forEach((cell) => cell.children.forEach(visitInline)))
  }
  document.blocks.forEach(visitBlock)
  return Object.freeze([...values])
}

export function makeAssetId(source: string): string {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `asset-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
