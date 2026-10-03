import { beforeEach, describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element })
})

describe('Issue 8 sanitizer policy', () => {
  it('removes executable HTML and network-loading attributes', async () => {
    const { sanitizeMarkdownHtml } = await import('./sanitizer')
    const clean = sanitizeMarkdownHtml('<script>alert(1)</script><img src="https://example.invalid/x" onerror="alert(1)"><a href="javascript:alert(1)">x</a><form action="https://example.invalid"><input autofocus></form>')
    expect(clean).not.toMatch(/script|onerror|javascript:|<form|src=/i)
  })
  it('removes active SVG content and external CSS URLs', async () => {
    const { sanitizeMermaidSvg } = await import('./sanitizer')
    const clean = sanitizeMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject>x</foreignObject><style>.x{fill:url(https://example.invalid/x)}</style><rect style="fill:url(https://example.invalid/y)"/></svg>')
    expect(clean).not.toMatch(/script|foreignObject|example\.invalid/i)
  })
})
