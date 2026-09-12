import { describe, expect, it } from 'vitest'
import { SelectionTokenStore } from '../../src/main/services/selection-token-store'

describe('SelectionTokenStore', () => {
  it('binds a native-dialog token to kind and owning webContents', () => {
    const store = new SelectionTokenStore(60_000)
    const record = store.issue('document-open', 'C:\\Docs\\README.md', 11)
    expect(store.owns(record.token, 'document-open', 11)).toBe(true)
    expect(store.owns(record.token, 'document-open', 12)).toBe(false)
    expect(store.owns(record.token, 'workspace-open', 11)).toBe(false)
  })

  it('consumes tokens once', () => {
    const store = new SelectionTokenStore(60_000)
    const record = store.issue('document-save', 'C:\\Docs\\README.md', 11)
    expect(store.consume(record.token, 'document-save', 11).path).toContain('README.md')
    expect(store.owns(record.token, 'document-save', 11)).toBe(false)
  })
})
