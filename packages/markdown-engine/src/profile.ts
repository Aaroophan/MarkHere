import type {
  MarkdownCapabilityDeclaration,
  MarkdownCapabilityProfile,
  UnknownSyntaxPolicy
} from './types'

export const MARKHERE_MARKDOWN_PROFILE: MarkdownCapabilityProfile = Object.freeze({
  commonMark: '0.31.2',
  gfmTables: true,
  gfmTaskLists: true,
  gfmStrikethrough: true,
  extendedAutolinks: true,
  frontMatter: true,
  math: true,
  mermaid: true,
  rawHtml: 'sanitized'
})

export const DEFAULT_UNKNOWN_SYNTAX_POLICY: UnknownSyntaxPolicy = 'preserve-opaque'

/**
 * Compatibility levels mirror 02-requirements-and-scope.md:
 * A = promised baseline, B = explicit MarkHere extension, C = preserved/fallback.
 */
export const MARKDOWN_CAPABILITY_REGISTRY: readonly MarkdownCapabilityDeclaration[] = Object.freeze([
  {
    id: 'commonmark-0.31.2',
    label: 'CommonMark 0.31.2',
    level: 'A',
    parse: true,
    preview: true,
    edit: 'full',
    serialize: 'semantic',
    export: 'planned'
  },
  {
    id: 'gfm-tables',
    label: 'GFM tables',
    level: 'A',
    parse: true,
    preview: true,
    edit: 'full',
    serialize: 'semantic',
    export: 'planned'
  },
  {
    id: 'gfm-task-lists',
    label: 'GFM task list items',
    level: 'A',
    parse: true,
    preview: true,
    edit: 'full',
    serialize: 'semantic',
    export: 'planned'
  },
  {
    id: 'gfm-strikethrough',
    label: 'GFM strikethrough',
    level: 'A',
    parse: true,
    preview: true,
    edit: 'full',
    serialize: 'semantic',
    export: 'planned'
  },
  {
    id: 'gfm-extended-autolinks',
    label: 'Extended URL autolinking',
    level: 'B',
    parse: true,
    preview: true,
    edit: 'source-only',
    serialize: 'lossless-source',
    export: 'planned'
  },
  {
    id: 'front-matter',
    label: 'YAML front matter',
    level: 'B',
    parse: true,
    preview: true,
    edit: 'source-only',
    serialize: 'lossless-source',
    export: 'planned'
  },
  {
    id: 'katex-math',
    label: 'KaTeX math delimiters',
    level: 'B',
    parse: true,
    preview: true,
    edit: 'source-only',
    serialize: 'lossless-source',
    export: 'planned'
  },
  {
    id: 'mermaid',
    label: 'Mermaid fenced diagrams',
    level: 'B',
    parse: true,
    preview: true,
    edit: 'source-only',
    serialize: 'lossless-source',
    export: 'planned'
  },
  {
    id: 'raw-html',
    label: 'Sanitized raw HTML',
    level: 'B',
    parse: true,
    preview: true,
    edit: 'protected',
    serialize: 'lossless-source',
    export: 'planned'
  },
  {
    id: 'unknown-extension',
    label: 'Unknown extension syntax',
    level: 'C',
    parse: false,
    preview: false,
    edit: 'source-only',
    serialize: 'lossless-source',
    export: 'source-only',
    unknownSyntaxPolicy: DEFAULT_UNKNOWN_SYNTAX_POLICY
  }
])

export function capabilityEnabled(
  profile: MarkdownCapabilityProfile,
  capability: keyof Omit<MarkdownCapabilityProfile, 'commonMark' | 'rawHtml'>
): boolean {
  return profile[capability]
}
