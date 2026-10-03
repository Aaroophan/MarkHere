import { describe, expect, it } from 'vitest'
import type { DocumentId, DocumentRevision, ExportJobId } from '@markhere/document-model'
import { buildExportDocument, createExportSnapshot, defaultCapabilityProfile } from './index'

const textFormat = Object.freeze({ encoding: 'utf-8', lineEnding: 'lf' as const, hasFinalNewline: true, bom: false })

function snapshot(markdown: string, revision = 25) {
  return createExportSnapshot({
    jobId: '00000000-0000-4000-8000-000000000007' as ExportJobId,
    documentId: '00000000-0000-4000-8000-000000000001' as DocumentId,
    revision: revision as DocumentRevision,
    markdown,
    format: 'html',
    title: 'Export fixture',
    textFormat,
    capabilityProfile: defaultCapabilityProfile(),
    resourceScopeId: 'scope-1'
  })
}

describe('ExportIR and revision snapshots', () => {
  it('freezes the exact Markdown revision supplied at job start', () => {
    let liveMarkdown = '# Revision 25\n\nSnapshot text.\n'
    const captured = snapshot(liveMarkdown, 25)
    liveMarkdown = '# Revision 30\n\nLater edits.\n'

    expect(captured.revision).toBe(25)
    expect(captured.markdown).toContain('Snapshot text')
    expect(captured.markdown).not.toContain('Later edits')
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured.textFormat)).toBe(true)
    expect(Object.isFrozen(captured.capabilityProfile)).toBe(true)
  })

  it('builds one semantic IR containing structural Markdown constructs', () => {
    const document = buildExportDocument(snapshot(`---\ntitle: Example\n---\n# Heading\n\nParagraph with **bold** and [link](https://example.com).\n\n- first\n- second\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n> quote\n\n\`\`\`ts\nconst answer = 42\n\`\`\`\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`\n\n$$x^2$$\n\n---\n`))
    const kinds = document.blocks.map((block) => block.kind)

    expect(document.schemaVersion).toBe(1)
    expect(document.revision).toBe(25)
    expect(kinds).toContain('front-matter')
    expect(kinds).toContain('heading')
    expect(kinds).toContain('paragraph')
    expect(kinds).toContain('list')
    expect(kinds).toContain('table')
    expect(kinds).toContain('blockquote')
    expect(kinds).toContain('code-block')
    expect(kinds).toContain('diagram')
    expect(kinds).toContain('math-block')
    expect(kinds).toContain('thematic-break')
  })
})
