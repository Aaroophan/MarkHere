import DOMPurify from 'dompurify'

const RAW_PREVIEW_FORBIDDEN_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'base', 'link', 'meta', 'form', 'button', 'textarea', 'select', 'option',
  'video', 'audio', 'source', 'track', 'picture'
]

const RAW_PREVIEW_FORBIDDEN_ATTRS = [
  'style', 'src', 'srcset', 'poster', 'background', 'srcdoc', 'formaction', 'action', 'target', 'autofocus', 'ping'
]

const EXTERNAL_CSS_URL = /url\(\s*(['"]?)(?!#)[^)]+\1\s*\)/i
const CSS_IMPORT = /@import\b/i
const SVG_URL_ATTRIBUTES = ['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start', 'marker-mid', 'marker-end'] as const

export function sanitizeMarkdownHtml(unsafeHtml: string): string {
  return String(DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: RAW_PREVIEW_FORBIDDEN_TAGS,
    FORBID_ATTR: RAW_PREVIEW_FORBIDDEN_ATTRS,
    ALLOW_DATA_ATTR: true,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    KEEP_CONTENT: true
  }))
}

export function sanitizeKatexHtml(generatedHtml: string): string {
  return String(DOMPurify.sanitize(generatedHtml, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror', 'srcdoc'],
    SANITIZE_DOM: true
  }))
}

export function sanitizeMermaidSvg(generatedSvg: string): string {
  const sanitized = String(DOMPurify.sanitize(generatedSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror', 'href', 'xlink:href'],
    SANITIZE_DOM: true
  }))

  // DOMPurify deliberately does not sanitize CSS. Mermaid legitimately emits
  // CSS, so instead of deleting all diagram styling, keep it only when it
  // cannot load an external resource. Fragment references such as url(#arrow)
  // are permitted because they resolve inside the already-sanitized SVG.
  const template = document.createElement('template')
  template.innerHTML = sanitized
  for (const style of template.content.querySelectorAll('style')) {
    const css = style.textContent ?? ''
    if (CSS_IMPORT.test(css) || EXTERNAL_CSS_URL.test(css)) style.remove()
  }
  for (const element of template.content.querySelectorAll<HTMLElement>('*')) {
    const inlineStyle = element.getAttribute('style')
    if (inlineStyle && EXTERNAL_CSS_URL.test(inlineStyle)) element.removeAttribute('style')
    for (const attribute of SVG_URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (value && /url\(/i.test(value) && !/^\s*url\(\s*#[-\w:.]+\s*\)\s*$/i.test(value)) {
        element.removeAttribute(attribute)
      }
    }
  }
  return template.innerHTML
}
