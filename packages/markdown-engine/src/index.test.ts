import { describe, expect, it } from 'vitest'
import {
  MARKHERE_MARKDOWN_PROFILE,
  HeadingSlugger,
  parseAndRenderMarkdown,
  parseMarkdown
} from './index'

describe('MarkHere Markdown engine', () => {
  it('pins the declared dialect', () => {
    expect(MARKHERE_MARKDOWN_PROFILE.commonMark).toBe('0.31.2')
    expect(MARKHERE_MARKDOWN_PROFILE.gfmTables).toBe(true)
    expect(MARKHERE_MARKDOWN_PROFILE.rawHtml).toBe('sanitized')
  })

  it('tags parse results with the source revision', () => {
    const result = parseMarkdown({ markdown: '# Hello', revision: 17 })
    expect(result.revision).toBe(17)
    expect(result.headings[0]?.slug).toBe('hello')
  })

  it('deduplicates Unicode heading slugs deterministically', () => {
    const slugger = new HeadingSlugger()
    expect(slugger.slug('安装')).toBe('安装')
    expect(slugger.slug('安装')).toBe('安装-1')
  })

  it('renders executable-looking fenced code only as escaped text', () => {
    const result = parseAndRenderMarkdown({ markdown: '```html\n<script>alert(1)</script>\n```', revision: 1 })
    expect(result.unsafeHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.unsafeHtml).not.toContain('<script>alert(1)</script>')
  })

  it('keeps canonical source out of the render pipeline', () => {
    const source = ':::unknown\nvalue\n:::'
    parseAndRenderMarkdown({ markdown: source, revision: 1 })
    expect(source).toBe(':::unknown\nvalue\n:::')
  })
})
