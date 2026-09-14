import katex from 'katex'
import mermaid from 'mermaid'
import {
  parseMarkdown,
  renderParsedMarkdown,
  type MarkdownDiagnostic,
  type MarkdownHeading,
  type MarkdownFeatureUsage
} from '@markhere/markdown-engine'
import { highlightCodeElement } from './highlight'
import { classifyPreviewImage } from './resource-url'
import { sanitizeKatexHtml, sanitizeMarkdownHtml, sanitizeMermaidSvg } from './sanitizer'

const MAX_MERMAID_SOURCE_LENGTH = 50_000
const MAX_MATH_SOURCE_LENGTH = 20_000
const MERMAID_RENDER_TIMEOUT_MS = 2_000
let mermaidInitialized = false
let mermaidCounter = 0

export type PreviewLinkResolution =
  | { readonly kind: 'anchor'; readonly headingSlug: string }
  | { readonly kind: 'document'; readonly documentId?: string; readonly openToken: string; readonly anchor?: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'blocked'; readonly reason: string }

export interface PreviewRendererOptions {
  readonly documentId: string
  readonly resourceScopeId: string
  readonly allowRemoteHttpsImages?: boolean
  readonly resolveLink: (href: string) => Promise<PreviewLinkResolution>
  readonly openDocumentToken: (openToken: string, anchor?: string, documentId?: string) => Promise<void>
  readonly openExternal: (url: string) => Promise<void>
}

export interface PreviewRenderRequest {
  readonly markdown: string
  readonly revision: number
}

export interface PreviewRenderReport {
  readonly revision: number
  readonly headings: readonly MarkdownHeading[]
  readonly diagnostics: readonly MarkdownDiagnostic[]
  readonly featureUsage: MarkdownFeatureUsage
  readonly renderedAt: number
}

function ensureMermaid(): void {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
    maxEdges: 500,
    deterministicIds: true,
    htmlLabels: false,
    secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels', 'suppressErrorRendering', 'dompurifyConfig', 'theme', 'themeCSS', 'themeVariables']
  })
  mermaidInitialized = true
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Preview render cancelled.', 'AbortError')
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('render-timeout')), timeoutMs)
        signal?.addEventListener('abort', () => reject(new DOMException('Preview render cancelled.', 'AbortError')), { once: true })
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function normalizeRawInteractiveElements(fragment: DocumentFragment): void {
  // Raw HTML IDs remain DOMPurify-prefixed. Only heading IDs created by
  // MarkHere's parser are restored from the controlled data attribute.
  for (const heading of fragment.querySelectorAll<HTMLElement>('[data-mh-heading]')) {
    const slug = heading.dataset.mhHeading
    if (slug) heading.id = slug
  }

  for (const anchor of fragment.querySelectorAll<HTMLAnchorElement>('a')) {
    const href = anchor.dataset.mhHref ?? anchor.getAttribute('href') ?? ''
    anchor.dataset.mhHref = href
    anchor.setAttribute('href', '#')
    anchor.setAttribute('rel', 'noopener noreferrer')
    anchor.removeAttribute('target')
    anchor.removeAttribute('ping')
  }

  for (const image of fragment.querySelectorAll<HTMLImageElement>('img')) {
    const source = image.dataset.mhSrc ?? image.getAttribute('src') ?? ''
    image.dataset.mhSrc = source
    image.removeAttribute('src')
    image.removeAttribute('srcset')
    image.removeAttribute('usemap')
    image.loading = 'lazy'
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
  }

  for (const input of fragment.querySelectorAll<HTMLInputElement>('input')) {
    input.type = 'checkbox'
    input.disabled = true
    input.removeAttribute('name')
    input.removeAttribute('value')
    input.removeAttribute('form')
  }
}

function resolveImages(
  fragment: DocumentFragment,
  options: PreviewRendererOptions,
  diagnostics: MarkdownDiagnostic[]
): void {
  for (const image of fragment.querySelectorAll<HTMLImageElement>('img[data-mh-src]')) {
    const rawTarget = image.dataset.mhSrc ?? ''
    const decision = classifyPreviewImage(
      rawTarget,
      options.resourceScopeId,
      options.allowRemoteHttpsImages === true
    )
    if (decision.kind === 'blocked') {
      image.removeAttribute('src')
      image.classList.add('mh-resource-blocked')
      image.dataset.mhResourceBlocked = decision.reason
      diagnostics.push({
        code: 'MD_RESOURCE_BLOCKED',
        severity: 'info',
        message: `Preview resource was blocked: ${decision.reason}`
      })
      continue
    }
    image.src = decision.url
    image.referrerPolicy = 'no-referrer'
  }
}

function renderMath(fragment: DocumentFragment, diagnostics: MarkdownDiagnostic[]): void {
  for (const element of fragment.querySelectorAll<HTMLElement>('[data-mh-math]')) {
    const source = element.textContent ?? ''
    const displayMode = element.dataset.mhMath === 'block'
    if (source.length > MAX_MATH_SOURCE_LENGTH) {
      element.classList.add('mh-render-error')
      element.textContent = `Math expression is too large to render.\n${source}`
      diagnostics.push({ code: 'MD_MATH_TOO_LARGE', severity: 'warning', message: 'A math expression exceeded the preview budget.' })
      continue
    }
    try {
      const generated = katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        strict: 'error',
        trust: false,
        maxSize: 100,
        maxExpand: 1_000,
        output: 'htmlAndMathml'
      })
      element.innerHTML = sanitizeKatexHtml(generated)
      element.dataset.mhMathRendered = 'true'
    } catch {
      element.classList.add('mh-render-error')
      element.textContent = `Math could not be rendered.\n${source}`
      diagnostics.push({ code: 'MD_MATH_RENDER_FAILED', severity: 'warning', message: 'A math expression could not be rendered.' })
    }
  }
}

async function renderMermaid(
  fragment: DocumentFragment,
  revision: number,
  signal: AbortSignal | undefined,
  diagnostics: MarkdownDiagnostic[]
): Promise<void> {
  ensureMermaid()
  const blocks = [...fragment.querySelectorAll<HTMLElement>('[data-mh-mermaid]')]
  for (const block of blocks) {
    checkAbort(signal)
    const sourceNode = block.querySelector<HTMLElement>('[data-mh-mermaid-source]')
    const source = sourceNode?.textContent ?? ''
    if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
      block.classList.add('mh-render-error')
      const notice = document.createElement('strong')
      notice.textContent = 'Diagram could not be rendered: source is too large.'
      block.prepend(notice)
      diagnostics.push({ code: 'MH_MERMAID_TOO_LARGE', severity: 'warning', message: 'A Mermaid diagram exceeded the preview budget.' })
      continue
    }
    try {
      const id = `mh-mermaid-${revision}-${++mermaidCounter}`
      const rendered = await withTimeout(mermaid.render(id, source), MERMAID_RENDER_TIMEOUT_MS, signal)
      checkAbort(signal)
      const wrapper = document.createElement('div')
      wrapper.className = 'mh-mermaid-rendered'
      wrapper.innerHTML = sanitizeMermaidSvg(rendered.svg)
      block.replaceChildren(wrapper)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      block.classList.add('mh-render-error')
      const notice = document.createElement('strong')
      notice.textContent = 'Diagram could not be rendered.'
      block.prepend(notice)
      diagnostics.push({ code: 'MH_MERMAID_RENDER_FAILED', severity: 'warning', message: 'A Mermaid diagram could not be rendered.' })
    }
  }
}

export class PreviewRenderer {
  readonly #target: HTMLElement
  readonly #options: PreviewRendererOptions
  #clickHandler: ((event: MouseEvent) => void) | null = null

  constructor(target: HTMLElement, options: PreviewRendererOptions) {
    this.#target = target
    this.#options = options
    this.#bindLinks()
  }

  async render(request: PreviewRenderRequest, signal?: AbortSignal): Promise<PreviewRenderReport> {
    checkAbort(signal)
    const parsed = parseMarkdown({ markdown: request.markdown, revision: request.revision })
    const rendered = renderParsedMarkdown(parsed)
    const diagnostics = [...rendered.diagnostics]
    checkAbort(signal)

    const template = document.createElement('template')
    template.innerHTML = sanitizeMarkdownHtml(rendered.unsafeHtml)
    const fragment = template.content
    normalizeRawInteractiveElements(fragment)
    resolveImages(fragment, this.#options, diagnostics)

    for (const pre of fragment.querySelectorAll<HTMLElement>('pre[data-mh-code-language]')) {
      highlightCodeElement(pre)
    }
    renderMath(fragment, diagnostics)
    await renderMermaid(fragment, request.revision, signal, diagnostics)
    checkAbort(signal)

    // Commit to the visible DOM exactly once, only after all asynchronous work
    // for this revision has completed and has not been cancelled.
    this.#target.replaceChildren(fragment)
    this.#target.dataset.mhRenderedRevision = String(request.revision)
    return Object.freeze({
      revision: request.revision,
      headings: rendered.headings,
      diagnostics: Object.freeze(diagnostics),
      featureUsage: rendered.featureUsage,
      renderedAt: Date.now()
    })
  }

  destroy(): void {
    if (this.#clickHandler) this.#target.removeEventListener('click', this.#clickHandler)
    this.#clickHandler = null
  }

  #bindLinks(): void {
    this.#clickHandler = (event: MouseEvent): void => {
      const element = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-mh-href]') : null
      if (!element) return
      event.preventDefault()
      const href = element.dataset.mhHref ?? ''
      void this.#activateLink(href)
    }
    this.#target.addEventListener('click', this.#clickHandler)
  }

  async #activateLink(href: string): Promise<void> {
    const resolved = await this.#options.resolveLink(href)
    if (resolved.kind === 'anchor') {
      const target = this.#target.querySelector<HTMLElement>(`#${CSS.escape(resolved.headingSlug)}`)
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    } else if (resolved.kind === 'document') {
      await this.#options.openDocumentToken(resolved.openToken, resolved.anchor, resolved.documentId)
    } else if (resolved.kind === 'external') {
      await this.#options.openExternal(resolved.url)
    }
  }
}

export {
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_MATH_SOURCE_LENGTH,
  MERMAID_RENDER_TIMEOUT_MS
}
