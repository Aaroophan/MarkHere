import { describe, expect, it } from 'vitest'
import type { DocumentId } from './index'
import {
  StaleDocumentRevisionError,
  applyPersistedRevision,
  applyReload,
  commitDocumentMutation,
  createLoadedDocumentSession,
  createUntitledDocumentSession,
  enterDocumentConflict
} from './index'

const id = '00000000-0000-4000-8000-000000000001' as DocumentId
const textFormat = { encoding: 'utf8', lineEnding: 'lf' as const, hasFinalNewline: true, bom: false }
const fingerprint = { size: 4, mtimeMs: 10, sha256: 'a'.repeat(64) }

function loaded() {
  return createLoadedDocumentSession({
    id,
    title: 'a.md',
    markdown: 'one\n',
    file: { displayPath: 'C:/a.md', capabilityId: id, basename: 'a.md', extension: '.md', parentDisplayPath: 'C:/', openedVia: 'dialog', writable: true },
    textFormat,
    fingerprint,
    resourceScopeId: id
  })
}

describe('canonical DocumentSession', () => {
  it('derives dirty state from revision and persistedRevision', () => {
    const edited = commitDocumentMutation(loaded(), { baseRevision: 1, markdown: 'two\n', source: 'source', transactionId: id })
    expect(edited.buffer.revision).toBe(2)
    expect(edited.buffer.persistedRevision).toBe(1)
    expect(edited.buffer.dirty).toBe(true)
  })

  it('keeps newer edits dirty when an older save completes', () => {
    const r2 = commitDocumentMutation(loaded(), { baseRevision: 1, markdown: 'two\n', source: 'source', transactionId: id })
    const r3 = commitDocumentMutation(r2, { baseRevision: 2, markdown: 'three\n', source: 'source', transactionId: id })
    const savedR2 = applyPersistedRevision(r3, 2, { ...fingerprint, mtimeMs: 20 })
    expect(savedR2.buffer.revision).toBe(3)
    expect(savedR2.buffer.persistedRevision).toBe(2)
    expect(savedR2.buffer.dirty).toBe(true)
  })

  it('rejects stale mutation bases', () => {
    expect(() => commitDocumentMutation(loaded(), { baseRevision: 0, markdown: 'bad', source: 'source' })).toThrow(StaleDocumentRevisionError)
  })

  it('marks reload as a persisted new revision', () => {
    const reloaded = applyReload(loaded(), { markdown: 'disk\n', fingerprint: { ...fingerprint, mtimeMs: 30 }, textFormat, transactionId: id })
    expect(reloaded.buffer.revision).toBe(2)
    expect(reloaded.buffer.persistedRevision).toBe(2)
    expect(reloaded.buffer.lastMutation?.source).toBe('reload')
    expect(reloaded.buffer.dirty).toBe(false)
  })

  it('models untitled documents as dirty with persisted revision zero', () => {
    const session = createUntitledDocumentSession({ id })
    expect(session.file).toBeNull()
    expect(session.buffer.persistedRevision).toBe(0)
    expect(session.buffer.dirty).toBe(true)
  })

  it('enters explicit conflict state without changing markdown', () => {
    const before = loaded()
    const conflicted = enterDocumentConflict(before, { reason: 'external-modification', expectedDiskFingerprint: fingerprint, actualDiskFingerprint: { ...fingerprint, mtimeMs: 99 } })
    expect(conflicted.lifecycle).toBe('conflict')
    expect(conflicted.buffer.markdown).toBe(before.buffer.markdown)
  })
})
