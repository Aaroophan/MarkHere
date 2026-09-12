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
