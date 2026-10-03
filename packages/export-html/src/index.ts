import katex from 'katex'
import sanitizeHtml from 'sanitize-html'
import type {
  ExportAsset,
  ExportBlock,
  ExportDocument,
  ExportInline,
  ExportRenderContext,
  ExportResultDiagnostic,
  HtmlExportOptions
} from '@markhere/export-core'

export interface HtmlExportResult {
  readonly html: string
  readonly diagnostics: readonly ExportResultDiagnostic[]
}

const BASE_CSS = `
:root{color-scheme:light dark}*{box-sizing:border-box}html{font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;line-height:1.58;background:#fff;color:#1f2937}body{margin:0}.mh-document{max-width:860px;margin:0 auto;padding:48px 56px 72px}h1,h2,h3,h4,h5,h6{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.25;margin:1.5em 0 .55em}h1{font-size:2.1rem}h2{font-size:1.65rem}h3{font-size:1.35rem}p,ul,ol,blockquote,pre,table,figure{margin:1em 0}a{color:#1557b0;text-decoration:underline}img{max-width:100%;height:auto}pre,code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px 16px;border-radius:6px;background:#f3f4f6}code{font-size:.92em}blockquote{margin-left:0;padding-left:1rem;border-left:4px solid #cbd5e1;color:#475569}table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}th{background:#f1f5f9}.mh-toc{padding:16px 20px;border:1px solid #d7dee8;border-radius:8px;background:#f8fafc}.mh-toc ol{margin:.5rem 0;padding-left:1.4rem}.mh-front-matter,.mh-fallback{padding:10px 12px;border:1px solid #d7dee8;border-radius:6px;background:#f8fafc}.mh-fallback figcaption{font-weight:600}.mh-task{list-style:none}.mh-task-marker{display:inline-block;width:1.35em}.mh-math{overflow-x:auto}.mh-raw{display:contents}hr{border:0;border-top:1px solid #cbd5e1;margin:2rem 0}@media print{html{color:#000;background:#fff}.mh-document{max-width:none;padding:0}a{color:inherit;text-decoration:underline}.mh-toc,.mh-front-matter,.mh-fallback,pre,th{background:#fff!important}}@media(max-width:720px){.mh-document{padding:24px 18px}}
`

const RAW_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del', 'blockquote', 'code', 'pre',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'sup', 'sub', 'kbd', 'mark', 'a'
]

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function safeId(value: string): string {
  return value.replace(/[^\p{L}\p{N}_.:-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 160) || 'section'
}

function safeHref(value: string): string | null {
  if (!value || /[\0-\x1F\x7F]/u.test(value)) return null
  if (value.startsWith('#')) return `#${safeId(value.slice(1))}`
  if (/^(?:\.\.?\/|[^/:?#]+(?:\/|$))/u.test(value) && !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) return value
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') return parsed.toString()
  } catch { /* not an allowed absolute URL */ }
  return null
}

function sanitizeRawHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: RAW_ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'title'], '*': ['id'] },
    allowedSchemes: ['https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => {
        const href = safeHref(attribs.href ?? '')
        return { tagName: 'a', attribs: { ...(href ? { href } : {}), ...(attribs.title ? { title: attribs.title } : {}) } }
      }
    },
    exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href
  })
}

function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    const value = (a << 16) | (b << 8) | c
    output += alphabet[(value >> 18) & 63] ?? ''
    output += alphabet[(value >> 12) & 63] ?? ''
    output += index + 1 < bytes.length ? alphabet[(value >> 6) & 63] ?? '' : '='
    output += index + 2 < bytes.length ? alphabet[value & 63] ?? '' : '='
  }
  return output
}

function assetDataUrl(asset: ExportAsset): string | null {
  if (!/^image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon)$/iu.test(asset.mimeType)) return null
  return `data:${asset.mimeType};base64,${base64(asset.bytes)}`
}

function inlinePlainText(inlines: readonly ExportInline[]): string {
  return inlines.map((inline) => {
    if (inline.kind === 'text') return inline.text
    if (inline.kind === 'break') return '\n'
    if (inline.kind === 'link') return inlinePlainText(inline.children)
    if (inline.kind === 'image') return inline.alt
    if (inline.kind === 'math') return inline.source
    return sanitizeRawHtml(inline.html).replace(/<[^>]+>/gu, '')
  }).join('')
}

function renderMath(source: string, display: boolean, diagnostics: ExportResultDiagnostic[]): string {
  try {
    return `<span class="mh-math${display ? ' mh-math-block' : ''}">${katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'mathml'
    })}</span>`
  } catch {
    diagnostics.push({ code: 'EXPORT_MATH_FALLBACK', severity: 'warning', message: 'A math expression was exported as source text.' })
    return `<code class="mh-math-source">${escapeHtml(source)}</code>`
  }
}

function renderInlines(
  inlines: readonly ExportInline[],
  assets: ReadonlyMap<string, ExportAsset>,
  options: HtmlExportOptions,
  diagnostics: ExportResultDiagnostic[]
): string {
  return inlines.map((inline) => {
    if (inline.kind === 'break') return inline.hard ? '<br>' : '\n'
    if (inline.kind === 'math') return renderMath(inline.source, false, diagnostics)
    if (inline.kind === 'raw-html-inline') return `<span class="mh-raw">${sanitizeRawHtml(inline.html)}</span>`
    if (inline.kind === 'image') {
      const asset = assets.get(inline.source)
      const embedded = asset ? assetDataUrl(asset) : null
      let src: string | null = embedded
      if (!src && options.imagePolicy === 'reference') {
        if (/^https:\/\//iu.test(inline.source)) src = inline.source
        else if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/iu.test(inline.source)) src = inline.source
        else if (/^(?:\.\.?\/|[^/:?#]+(?:\/|$))/u.test(inline.source)) src = inline.source
      }
      if (!src) {
        diagnostics.push({ code: 'EXPORT_IMAGE_UNRESOLVED', severity: 'warning', message: `Image could not be embedded: ${inline.source}`, ...(inline.sourceRef ? { source: inline.sourceRef } : {}) })
        return `<span class="mh-image-fallback">[Image: ${escapeHtml(inline.alt || inline.source)}]</span>`
      }
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(inline.alt)}"${inline.title ? ` title="${escapeHtml(inline.title)}"` : ''}>`
    }
    if (inline.kind === 'link') {
      const label = renderInlines(inline.children, assets, options, diagnostics)
      const href = safeHref(inline.href)
      if (!href) {
        diagnostics.push({ code: 'EXPORT_LINK_BLOCKED', severity: 'warning', message: `Unsafe link was exported without navigation: ${inline.href}` })
        return label
      }
      return `<a href="${escapeHtml(href)}"${inline.title ? ` title="${escapeHtml(inline.title)}"` : ''}>${label}</a>`
    }
    let text = escapeHtml(inline.text)
    for (const mark of inline.marks) {
      if (mark === 'bold') text = `<strong>${text}</strong>`
      else if (mark === 'italic') text = `<em>${text}</em>`
      else if (mark === 'strikethrough') text = `<s>${text}</s>`
      else if (mark === 'code') text = `<code>${text}</code>`
    }
    return text
  }).join('')
}

function renderBlocks(
  blocks: readonly ExportBlock[],
  assets: ReadonlyMap<string, ExportAsset>,
  options: HtmlExportOptions,
  diagnostics: ExportResultDiagnostic[]
): string {
  return blocks.map((block) => {
    if (block.kind === 'heading') {
      const id = block.id ? ` id="${escapeHtml(safeId(block.id))}"` : ''
      return `<h${block.level}${id}>${renderInlines(block.children, assets, options, diagnostics)}</h${block.level}>`
    }
    if (block.kind === 'paragraph') return `<p>${renderInlines(block.children, assets, options, diagnostics)}</p>`
    if (block.kind === 'blockquote') return `<blockquote>${renderBlocks(block.blocks, assets, options, diagnostics)}</blockquote>`
    if (block.kind === 'list') {
      const tag = block.ordered ? 'ol' : 'ul'
      const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : ''
      const items = block.items.map((item) => {
        const task = item.checked === undefined ? '' : `<span class="mh-task-marker" aria-label="${item.checked ? 'checked' : 'unchecked'}">${item.checked ? '☑' : '☐'}</span>`
        return `<li${item.checked === undefined ? '' : ' class="mh-task"'}>${task}${renderBlocks(item.blocks, assets, options, diagnostics)}</li>`
      }).join('')
      return `<${tag}${start}>${items}</${tag}>`
    }
    if (block.kind === 'table') {
      const rows = block.rows.map((row, rowIndex) => `<tr>${row.map((cell) => {
        const tag = cell.header || rowIndex === 0 && row.every((candidate) => candidate.header) ? 'th' : 'td'
        return `<${tag}>${renderInlines(cell.children, assets, options, diagnostics)}</${tag}>`
      }).join('')}</tr>`)
      const hasHeader = block.rows[0]?.some((cell) => cell.header) ?? false
      return `<table>${hasHeader && rows[0] ? `<thead>${rows[0]}</thead><tbody>${rows.slice(1).join('')}</tbody>` : `<tbody>${rows.join('')}</tbody>`}</table>`
    }
    if (block.kind === 'code-block') return `<pre><code${block.language ? ` class="language-${escapeHtml(block.language.replace(/[^A-Za-z0-9_-]/gu, ''))}"` : ''}>${escapeHtml(block.code)}</code></pre>`
    if (block.kind === 'diagram') {
      diagnostics.push({ code: 'EXPORT_MERMAID_SOURCE_FALLBACK', severity: 'warning', message: 'Mermaid is represented as source text in this export build.', ...(block.source ? { source: block.source } : {}) })
      return `<figure class="mh-fallback mh-diagram-fallback"><figcaption>Mermaid diagram source</figcaption><pre><code>${escapeHtml(block.sourceText)}</code></pre></figure>`
    }
    if (block.kind === 'math-block') return `<div class="mh-math">${renderMath(block.sourceText, true, diagnostics)}</div>`
    if (block.kind === 'thematic-break') return '<hr>'
    if (block.kind === 'raw-html') return `<div class="mh-raw">${sanitizeRawHtml(block.html)}</div>`
    if (block.kind === 'front-matter') return options.includeFrontMatter ? `<pre class="mh-front-matter"><code>${escapeHtml(block.sourceText)}</code></pre>` : ''
    diagnostics.push({ code: 'EXPORT_OPAQUE_SOURCE_FALLBACK', severity: 'warning', message: `Unsupported Markdown token '${block.tokenType}' was preserved as text.`, ...(block.source ? { source: block.source } : {}) })
    return `<pre class="mh-fallback"><code>${escapeHtml(block.sourceText)}</code></pre>`
  }).join('\n')
}

function tableOfContents(document: ExportDocument): string {
  const headings = document.blocks.filter((block): block is Extract<ExportBlock, { kind: 'heading' }> => block.kind === 'heading' && !!block.id)
  if (!headings.length) return ''
  return `<nav class="mh-toc" aria-label="Table of contents"><strong>Contents</strong><ol>${headings.map((heading) => `<li style="margin-left:${Math.max(0, heading.level - 1) * 1.1}rem"><a href="#${escapeHtml(safeId(heading.id!))}">${escapeHtml(inlinePlainText(heading.children))}</a></li>`).join('')}</ol></nav>`
}

export function renderStandaloneHtml(context: ExportRenderContext, options: HtmlExportOptions): HtmlExportResult {
  const diagnostics: ExportResultDiagnostic[] = context.document.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.sourceRange ? { source: diagnostic.sourceRange } : {})
  }))
  const title = options.documentTitle?.trim() || context.document.title || 'MarkHere Document'
  const toc = options.includeTableOfContents ? tableOfContents(context.document) : ''
  const body = renderBlocks(context.document.blocks, context.assets, options, diagnostics)
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="MarkHere"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'"><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body><article class="mh-document">${toc}${body}</article></body></html>`
  return Object.freeze({ html, diagnostics: Object.freeze(diagnostics) })
}

export function renderPrintHtml(context: ExportRenderContext, options: Omit<HtmlExportOptions, 'imagePolicy'>): HtmlExportResult {
  const result = renderStandaloneHtml(context, { ...options, imagePolicy: 'embed-local' })
  // PDF/print surfaces must not initiate remote network requests. All local
  // assets are already data URIs; remove https from the CSP for print use.
  return Object.freeze({
    html: result.html.replace("img-src data: https:;", "img-src data:;"),
    diagnostics: result.diagnostics
  })
}
