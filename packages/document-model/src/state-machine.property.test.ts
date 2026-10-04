import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { DocumentId } from './index'
import { applyPersistedRevision, commitDocumentMutation, createUntitledDocumentSession } from './index'

const id = '00000000-0000-4000-8000-000000000001' as DocumentId
const fingerprint = { size: 1, mtimeMs: 1 }

describe('FR-SAVE-004 document state-machine properties', () => {
  it('always preserves dirty === revision !== persistedRevision under generated edits/saves', () => {
    fc.assert(fc.property(fc.array(fc.oneof(
      fc.record({ kind: fc.constant('edit' as const), text: fc.string({ maxLength: 80 }) }),
      fc.record({ kind: fc.constant('save-current' as const) }),
      fc.record({ kind: fc.constant('save-stale' as const), behind: fc.integer({ min: 0, max: 8 }) })
    ), { minLength: 1, maxLength: 100 }), (ops) => {
      let session = createUntitledDocumentSession({ id })
      for (const op of ops) {
        if (op.kind === 'edit') session = commitDocumentMutation(session, { baseRevision: session.buffer.revision, markdown: op.text, source: 'source' })
        else if (op.kind === 'save-current') session = applyPersistedRevision(session, session.buffer.revision, fingerprint)
        else session = applyPersistedRevision(session, Math.max(0, session.buffer.revision - op.behind), fingerprint)
        expect(session.buffer.dirty).toBe(session.buffer.revision !== session.buffer.persistedRevision)
        expect(session.buffer.persistedRevision).toBeLessThanOrEqual(session.buffer.revision)
      }
    }), { numRuns: 250 })
  })
})
