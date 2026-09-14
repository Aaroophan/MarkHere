import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-yaml'

const MAX_HIGHLIGHT_SOURCE_LENGTH = 200_000
const aliases: Readonly<Record<string, string>> = Object.freeze({
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  py: 'python',
  cs: 'csharp',
  'c#': 'csharp',
  md: 'markdown',
  yml: 'yaml'
})

export interface HighlightResult {
  readonly highlighted: boolean
  readonly language: string
  readonly skippedReason?: string
}

export function highlightCodeElement(pre: HTMLElement): HighlightResult {
  const code = pre.querySelector('code')
  if (!code) return { highlighted: false, language: '', skippedReason: 'missing-code-element' }
  const requested = (pre.dataset.mhCodeLanguage ?? '').trim().toLowerCase()
  if (!requested) return { highlighted: false, language: '' }
  const language = aliases[requested] ?? requested
  const source = code.textContent ?? ''
  if (source.length > MAX_HIGHLIGHT_SOURCE_LENGTH) {
    return { highlighted: false, language, skippedReason: 'code-block-too-large' }
  }
  const grammar = Prism.languages[language]
  if (!grammar) return { highlighted: false, language, skippedReason: 'unknown-language' }
  code.innerHTML = Prism.highlight(source, grammar, language)
  code.className = `language-${language}`
  pre.classList.add(`language-${language}`)
  return { highlighted: true, language }
}

export { MAX_HIGHLIGHT_SOURCE_LENGTH }
