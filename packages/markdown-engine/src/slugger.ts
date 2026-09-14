const combiningMarks = /[\u0300-\u036f]/g
const disallowedSlugCharacters = /[^\p{L}\p{N}\p{M}\p{Pc}\-\s]/gu
const whitespace = /\s+/g
const repeatedHyphens = /-+/g

export function slugifyHeadingText(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .replace(combiningMarks, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(disallowedSlugCharacters, '')
    .replace(whitespace, '-')
    .replace(repeatedHyphens, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'section'
}

export class HeadingSlugger {
  readonly #counts = new Map<string, number>()

  slug(text: string): string {
    const base = slugifyHeadingText(text)
    const count = this.#counts.get(base) ?? 0
    this.#counts.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

export function normalizeHeadingFragment(fragment: string): string {
  const withoutHash = fragment.startsWith('#') ? fragment.slice(1) : fragment
  let decoded = withoutHash
  try { decoded = decodeURIComponent(withoutHash) } catch { /* retain literal fragment */ }
  return slugifyHeadingText(decoded)
}
