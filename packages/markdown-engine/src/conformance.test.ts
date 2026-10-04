import { describe, expect, it } from 'vitest'
import { tests as commonMarkCases } from 'commonmark-spec'
import { parseMarkdown, renderCommonMarkConformance } from './index'

describe('FR-MD-001 CommonMark 0.31.2 conformance', () => {
  it('loads the pinned official CommonMark corpus', () => {
    expect(commonMarkCases.length).toBeGreaterThan(500)
  })

  for (const fixture of commonMarkCases) {
    const number = fixture.number
    it(`CM-${number} ${fixture.section}`, () => {
      expect(renderCommonMarkConformance(fixture.markdown)).toBe(fixture.html)
    })
  }
})

describe('FR-MD-002..008 MarkHere dialect conformance', () => {
  it('recognizes GFM tables/tasks/strikethrough and registered extensions without mutating source', () => {
    const markdown = `---\ntitle: test\n---\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n~~strike~~ $x^2$\n\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`
    const parsed = parseMarkdown({ markdown, revision: 7 })
    expect(parsed.revision).toBe(7)
    expect(parsed.featureUsage.tables).toBeGreaterThan(0)
    expect(parsed.featureUsage.taskListItems).toBeGreaterThan(0)
    expect(parsed.featureUsage.strikethrough).toBeGreaterThan(0)
    expect(parsed.featureUsage.frontMatter).toBe(1)
    expect(parsed.featureUsage.mathInline).toBeGreaterThan(0)
    expect(parsed.featureUsage.mermaid).toBe(1)
    expect(markdown).toContain('graph TD')
  })
})
