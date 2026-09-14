import markdownit from 'markdown-it'
import { HeadingSlugger } from './slugger'
import { MARKHERE_MARKDOWN_PROFILE } from './profile'
import type {
  MarkdownDiagnostic,
  MarkdownFeatureUsage,
  MarkdownHeading,
  MarkdownNode,
  MarkdownParseInput,
  MarkdownParseResult,
  MarkdownRenderResult,
  MarkdownResourceReference,
  MarkdownSourceRange
} from './types'

const MAX_MARKDOWN_SOURCE_LENGTH = 32 * 1024 * 1024
const TASK_MARKER = /^\[([ xX])\][ \t]+/
const MERMAID_LANGUAGE = /^mermaid(?:\s|$)/i

function createParser(profile = MARKHERE_MARKDOWN_PROFILE): ReturnType<typeof markdownit> {
  const md = markdownit({
    html: profile.rawHtml === 'sanitized',
    linkify: profile.extendedAutolinks,
    typographer: false,
    breaks: false
  })

  if (!profile.gfmTables) md.disable('table')
  if (!profile.gfmStrikethrough) md.disable('strikethrough')
  if (profile.frontMatter) installFrontMatter(md)
  if (profile.math) installMath(md)
  if (profile.gfmTaskLists) installTaskLists(md)
  installRendererRules(md)
  return md
}

function installFrontMatter(md: ReturnType<typeof markdownit>): void {
  md.block.ruler.before('hr', 'markhere_front_matter', (state, startLine, endLine, silent) => {
    if (startLine !== 0) return false
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const maximum = state.eMarks[startLine]
    if (state.src.slice(start, maximum).trim() !== '---') return false

    let next = startLine + 1
    for (; next < endLine; next += 1) {
      const lineStart = state.bMarks[next] + state.tShift[next]
      const lineEnd = state.eMarks[next]
      if (state.src.slice(lineStart, lineEnd).trim() !== '---') continue
      if (silent) return true

      const token = state.push('front_matter', '', 0)
      token.block = true
      token.map = [startLine, next + 1]
      token.markup = '---'
      const contentStart = state.bMarks[startLine + 1] ?? state.eMarks[startLine]
      const contentEnd = state.bMarks[next]
      token.content = state.src.slice(contentStart, contentEnd).replace(/\r?\n$/, '')
      state.line = next + 1
      return true
    }
    return false
  }, { alt: [] })
}

function installMath(md: ReturnType<typeof markdownit>): void {
  md.inline.ruler.after('escape', 'markhere_math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false
    const afterOpen = state.src[state.pos + 1]
    if (!afterOpen || /\s/.test(afterOpen)) return false

    let cursor = state.pos + 1
    while (cursor < state.posMax) {
      const close = state.src.indexOf('$', cursor)
      if (close < 0) return false
      if (state.src[close - 1] === '\\') {
        cursor = close + 1
        continue
      }
      const beforeClose = state.src[close - 1]
      if (!beforeClose || /\s/.test(beforeClose)) {
        cursor = close + 1
        continue
      }
      if (!silent) {
        const token = state.push('math_inline', 'math', 0)
        token.markup = '$'
        token.content = state.src.slice(state.pos + 1, close)
      }
      state.pos = close + 1
      return true
    }
    return false
  })

  md.block.ruler.before('fence', 'markhere_math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const maximum = state.eMarks[startLine]
    const opening = state.src.slice(start, maximum).trim()
    if (!opening.startsWith('$$')) return false

    const singleLine = opening.length > 4 && opening.endsWith('$$')
    if (singleLine) {
      if (silent) return true
      const token = state.push('math_block', 'math', 0)
      token.block = true
      token.map = [startLine, startLine + 1]
      token.markup = '$$'
      token.content = opening.slice(2, -2).trim()
      state.line = startLine + 1
      return true
    }

    if (opening !== '$$') return false
    let next = startLine + 1
    for (; next < endLine; next += 1) {
      const lineStart = state.bMarks[next] + state.tShift[next]
      const lineEnd = state.eMarks[next]
      if (state.src.slice(lineStart, lineEnd).trim() !== '$$') continue
      if (silent) return true
      const token = state.push('math_block', 'math', 0)
      token.block = true
      token.map = [startLine, next + 1]
      token.markup = '$$'
      token.content = state.getLines(startLine + 1, next, state.tShift[startLine], true).replace(/\n$/, '')
      state.line = next + 1
      return true
    }
    return false
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
}

function installTaskLists(md: ReturnType<typeof markdownit>): void {
  md.core.ruler.after('inline', 'markhere_task_lists', (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const item = state.tokens[index]
      if (!item || item.type !== 'list_item_open') continue

      let inlineIndex = index + 1
      while (inlineIndex < state.tokens.length) {
        const candidate = state.tokens[inlineIndex]
        if (!candidate || candidate.type === 'list_item_close') break
        if (candidate.type === 'inline' && candidate.children?.length) {
          const first = candidate.children[0]
          if (first?.type !== 'text') break
          const match = TASK_MARKER.exec(first.content)
          if (!match) break

          const checked = match[1]?.toLowerCase() === 'x'
          first.content = first.content.slice(match[0].length)
          const checkbox = new state.Token('task_checkbox', 'input', 0)
          checkbox.meta = { checked }
          candidate.children.unshift(checkbox)
          item.attrJoin('class', 'task-list-item')
          item.attrSet('data-mh-task', checked ? 'checked' : 'unchecked')
          break
        }
        inlineIndex += 1
      }
    }
  })
}

function installRendererRules(md: ReturnType<typeof markdownit>): void {
  const escape = md.utils.escapeHtml
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.front_matter = (tokens, index) => {
    const token = tokens[index]
    if (!token) return ''
    return `<section class="mh-front-matter" data-mh-front-matter="true"><div class="mh-front-matter-label">Front matter</div><pre><code>${escape(token.content)}</code></pre></section>\n`
  }

  md.renderer.rules.math_inline = (tokens, index) => {
    const token = tokens[index]
    return token
      ? `<span class="mh-math mh-math-inline" data-mh-math="inline">${escape(token.content)}</span>`
      : ''
  }

  md.renderer.rules.math_block = (tokens, index) => {
    const token = tokens[index]
    return token
      ? `<div class="mh-math mh-math-block" data-mh-math="block">${escape(token.content)}</div>\n`
      : ''
  }

  md.renderer.rules.task_checkbox = (tokens, index) => {
    const checked = tokens[index]?.meta?.checked === true
    return `<input type="checkbox" data-mh-task-checkbox="true" disabled${checked ? ' checked' : ''} aria-label="${checked ? 'Checked task' : 'Unchecked task'}"> `
  }

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]
    if (!token) return ''
    const language = token.info.trim().split(/\s+/u)[0] ?? ''
    if (MERMAID_LANGUAGE.test(token.info.trim())) {
      return `<div class="mh-mermaid" data-mh-mermaid="true"><pre data-mh-mermaid-source="true">${escape(token.content)}</pre></div>\n`
    }
    const safeLanguage = escape(language)
    const languageClass = safeLanguage ? ` class="language-${safeLanguage}"` : ''
    return `<pre class="mh-code-block" data-mh-code-language="${safeLanguage}"><code${languageClass}>${escape(token.content)}</code></pre>\n`
      || defaultFence?.(tokens, index, options, env, self)
      || ''
  }

  md.renderer.rules.code_block = (tokens, index) => {
    const token = tokens[index]
    return token
      ? `<pre class="mh-code-block" data-mh-code-language=""><code>${escape(token.content)}</code></pre>\n`
      : ''
  }

  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]
    if (!token) return ''
    const src = token.attrGet('src') ?? ''
    const title = token.attrGet('title')
    const alt = token.content
    return `<img data-mh-src="${escape(src)}" alt="${escape(alt)}"${title ? ` title="${escape(title)}"` : ''} loading="lazy" decoding="async">`
  }

  const defaultLinkOpen = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]
    if (!token) return ''
    const href = token.attrGet('data-mh-href') ?? token.attrGet('href') ?? ''
    token.attrSet('href', '#')
    token.attrSet('data-mh-href', href)
    token.attrSet('rel', 'noopener noreferrer')
    return defaultLinkOpen?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
  }
}

function tokenRange(token: { map: [number, number] | null }): MarkdownSourceRange | undefined {
  return token.map ? { startLine: token.map[0], endLine: token.map[1] } : undefined
}

function attrsToRecord(token: { attrs: [string, string][] | null }): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(token.attrs ?? []))
}

type MarkdownItParser = ReturnType<typeof createParser>
type MarkdownItToken = ReturnType<MarkdownItParser['parse']>[number]

function tokenToNode(token: MarkdownItToken): MarkdownNode {
  const range = tokenRange(token)
  const children = token.children?.map((child) => tokenToNode(child))
  return Object.freeze({
    type: token.type,
    tag: token.tag,
    nesting: token.nesting,
    level: token.level,
    content: token.content,
    info: token.info,
    markup: token.markup,
    attrs: attrsToRecord(token),
    ...(range ? { sourceRange: range } : {}),
    ...(children && children.length ? { children } : {})
  })
}

function emptyFeatureUsage(): MarkdownFeatureUsage {
  return {
    tables: 0,
    taskListItems: 0,
    strikethrough: 0,
    autolinks: 0,
    frontMatter: 0,
    mathInline: 0,
    mathBlock: 0,
    mermaid: 0,
    rawHtml: 0,
    fencedCode: 0,
    images: 0,
    links: 0
  }
}

function collectMetadata(
  tokens: ReturnType<ReturnType<typeof createParser>['parse']>,
  diagnostics: MarkdownDiagnostic[]
): {
  headings: MarkdownHeading[]
  resources: MarkdownResourceReference[]
  featureUsage: MarkdownFeatureUsage
} {
  const headings: MarkdownHeading[] = []
  const resources: MarkdownResourceReference[] = []
  const usage = emptyFeatureUsage()
  const slugger = new HeadingSlugger()

  const inspectInline = (
    children: NonNullable<(typeof tokens)[number]['children']>,
    range?: MarkdownSourceRange
  ): void => {
    for (const child of children) {
      if (child.type === 'image') {
        usage.images += 1
        const target = child.attrGet('src') ?? ''
        const title = child.attrGet('title') ?? undefined
        resources.push({ kind: 'image', target, ...(title ? { title } : {}), ...(range ? { sourceRange: range } : {}) })
      } else if (child.type === 'link_open') {
        usage.links += 1
        const target = child.attrGet('href') ?? ''
        const title = child.attrGet('title') ?? undefined
        resources.push({ kind: 'link', target, ...(title ? { title } : {}), ...(range ? { sourceRange: range } : {}) })
        if (child.markup === 'linkify') usage.autolinks += 1
      } else if (child.type === 's_open') usage.strikethrough += 1
      else if (child.type === 'task_checkbox') usage.taskListItems += 1
      else if (child.type === 'math_inline') usage.mathInline += 1
      if (child.children?.length) inspectInline(child.children, range)
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) continue
    const range = tokenRange(token)
    if (token.type === 'heading_open') {
      const inline = tokens[index + 1]
      const level = Number.parseInt(token.tag.slice(1), 10)
      const text = inline?.type === 'inline' ? inline.content : ''
      const slug = slugger.slug(text)
      token.attrSet('id', slug)
      token.attrSet('data-mh-heading', slug)
      if (range) token.attrSet('data-mh-source-line', String(range.startLine))
      headings.push({ level, text, slug, ...(range ? { sourceRange: range } : {}) })
    } else if (token.type === 'table_open') usage.tables += 1
    else if (token.type === 'front_matter') usage.frontMatter += 1
    else if (token.type === 'math_block') usage.mathBlock += 1
    else if (token.type === 'html_block') usage.rawHtml += 1
    else if (token.type === 'fence') {
      usage.fencedCode += 1
      if (MERMAID_LANGUAGE.test(token.info.trim())) usage.mermaid += 1
    }
    if (token.type === 'inline' && token.children?.length) {
      inspectInline(token.children, range)
      if (token.children.some((child) => child.type === 'html_inline')) usage.rawHtml += 1
    }
  }

  if (usage.frontMatter > 1) {
    diagnostics.push({ code: 'MD_FRONT_MATTER_MULTIPLE', severity: 'warning', message: 'Only leading front matter is treated as a MarkHere front-matter block.' })
  }

  return { headings, resources, featureUsage: usage }
}

export function parseMarkdown(input: MarkdownParseInput): MarkdownParseResult {
  const profile = input.profile ?? MARKHERE_MARKDOWN_PROFILE
  const diagnostics: MarkdownDiagnostic[] = []
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    throw new Error('Markdown parse revision must be a non-negative integer.')
  }
  if (input.markdown.length > MAX_MARKDOWN_SOURCE_LENGTH) {
    diagnostics.push({
      code: 'MD_SOURCE_TOO_LARGE',
      severity: 'error',
      message: `Markdown source exceeds the ${MAX_MARKDOWN_SOURCE_LENGTH}-character preview parsing budget.`
    })
    return Object.freeze({
      revision: input.revision,
      profile,
      sourceLength: input.markdown.length,
      tree: Object.freeze([]),
      headings: Object.freeze([]),
      resources: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics),
      featureUsage: Object.freeze(emptyFeatureUsage()),
      internalTokens: Object.freeze([])
    })
  }

  const parser = createParser(profile)
  try {
    const tokens = parser.parse(input.markdown, {})
    const metadata = collectMetadata(tokens, diagnostics)
    return Object.freeze({
      revision: input.revision,
      profile,
      sourceLength: input.markdown.length,
      tree: Object.freeze(tokens.map((token) => tokenToNode(token))),
      headings: Object.freeze(metadata.headings),
      resources: Object.freeze(metadata.resources),
      diagnostics: Object.freeze(diagnostics),
      featureUsage: Object.freeze(metadata.featureUsage),
      internalTokens: Object.freeze(tokens)
    })
  } catch (error) {
    diagnostics.push({
      code: 'MD_PARSE_INTERNAL_FAILURE',
      severity: 'error',
      message: error instanceof Error ? error.message : 'Markdown parser failed.'
    })
    return Object.freeze({
      revision: input.revision,
      profile,
      sourceLength: input.markdown.length,
      tree: Object.freeze([]),
      headings: Object.freeze([]),
      resources: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics),
      featureUsage: Object.freeze(emptyFeatureUsage()),
      internalTokens: Object.freeze([])
    })
  }
}

export function renderParsedMarkdown(result: MarkdownParseResult): MarkdownRenderResult {
  if (result.internalTokens.length === 0) {
    const diagnostic = result.diagnostics[0]
    const safeMessage = diagnostic?.message ?? 'Markdown preview is unavailable.'
    const fallback = `<section class="mh-preview-error" role="status"><strong>Preview unavailable</strong><p>${escapeFallback(safeMessage)}</p></section>`
    return Object.freeze({
      revision: result.revision,
      unsafeHtml: fallback,
      headings: result.headings,
      diagnostics: result.diagnostics,
      featureUsage: result.featureUsage
    })
  }
  const parser = createParser(result.profile)
  const tokens = result.internalTokens as unknown as ReturnType<typeof parser.parse>
  const unsafeHtml = parser.renderer.render(tokens, parser.options, {})
  return Object.freeze({
    revision: result.revision,
    unsafeHtml,
    headings: result.headings,
    diagnostics: result.diagnostics,
    featureUsage: result.featureUsage
  })
}

export function parseAndRenderMarkdown(input: MarkdownParseInput): MarkdownRenderResult {
  return renderParsedMarkdown(parseMarkdown(input))
}

function escapeFallback(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] ?? character)
}

export { MAX_MARKDOWN_SOURCE_LENGTH }
