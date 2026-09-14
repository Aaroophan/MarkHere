export type UnknownSyntaxPolicy =
  | 'preserve-opaque'
  | 'source-only'
  | 'render-as-text'
  | 'explicitly-unsupported'

export type MarkdownCompatibilityLevel = 'A' | 'B' | 'C'

export interface MarkdownCapabilityProfile {
  readonly commonMark: '0.31.2'
  readonly gfmTables: boolean
  readonly gfmTaskLists: boolean
  readonly gfmStrikethrough: boolean
  readonly extendedAutolinks: boolean
  readonly frontMatter: boolean
  readonly math: boolean
  readonly mermaid: boolean
  readonly rawHtml: 'sanitized'
}

export interface MarkdownCapabilityDeclaration {
  readonly id: string
  readonly label: string
  readonly level: MarkdownCompatibilityLevel
  readonly parse: boolean
  readonly preview: boolean
  readonly edit: 'full' | 'source-only' | 'protected'
  readonly serialize: 'lossless-source' | 'semantic' | 'unsupported'
  readonly export: 'planned' | 'supported' | 'source-only'
  readonly unknownSyntaxPolicy?: UnknownSyntaxPolicy
}

export interface MarkdownSourceRange {
  /** Zero-based source line, inclusive. */
  readonly startLine: number
  /** Zero-based source line, exclusive. */
  readonly endLine: number
}

export interface MarkdownNode {
  readonly type: string
  readonly tag: string
  readonly nesting: number
  readonly level: number
  readonly content: string
  readonly info: string
  readonly markup: string
  readonly attrs: Readonly<Record<string, string>>
  readonly sourceRange?: MarkdownSourceRange
  readonly children?: readonly MarkdownNode[]
}

export interface MarkdownStructureBlock {
  readonly blockId: string
  readonly sourceRange: MarkdownSourceRange
  readonly headingSlug?: string
}

export interface MarkdownHeading {
  readonly level: number
  readonly text: string
  readonly slug: string
  readonly sourceRange?: MarkdownSourceRange
}

export type MarkdownResourceKind = 'image' | 'link'

export interface MarkdownResourceReference {
  readonly kind: MarkdownResourceKind
  readonly target: string
  readonly title?: string
  readonly sourceRange?: MarkdownSourceRange
}

export interface MarkdownDiagnostic {
  readonly code: string
  readonly severity: 'info' | 'warning' | 'error'
  readonly message: string
  readonly sourceRange?: MarkdownSourceRange
}

export interface MarkdownFeatureUsage {
  readonly tables: number
  readonly taskListItems: number
  readonly strikethrough: number
  readonly autolinks: number
  readonly frontMatter: number
  readonly mathInline: number
  readonly mathBlock: number
  readonly mermaid: number
  readonly rawHtml: number
  readonly fencedCode: number
  readonly images: number
  readonly links: number
}

export interface MarkdownParseInput {
  readonly markdown: string
  readonly revision: number
  readonly profile?: MarkdownCapabilityProfile
}

export interface MarkdownParseResult {
  readonly revision: number
  readonly profile: MarkdownCapabilityProfile
  readonly sourceLength: number
  readonly tree: readonly MarkdownNode[]
  readonly headings: readonly MarkdownHeading[]
  readonly structure: readonly MarkdownStructureBlock[]
  readonly resources: readonly MarkdownResourceReference[]
  readonly diagnostics: readonly MarkdownDiagnostic[]
  readonly featureUsage: MarkdownFeatureUsage
  /** Internal parser tokens are derived/disposable and never canonical state. */
  readonly internalTokens: readonly unknown[]
}

export interface MarkdownRenderResult {
  readonly revision: number
  /** Intentionally unsanitized. Only PreviewRenderer may insert after DOMPurify. */
  readonly unsafeHtml: string
  readonly headings: readonly MarkdownHeading[]
  readonly structure: readonly MarkdownStructureBlock[]
  readonly diagnostics: readonly MarkdownDiagnostic[]
  readonly featureUsage: MarkdownFeatureUsage
}
