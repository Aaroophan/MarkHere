import { describe, expect, it } from 'vitest'
import { migratePersistedSettings } from '../../src/main/storage/settings-service'

describe('Issue 6 settings migration', () => {
  it('fills new v1 fields when loading an older Issue-5 v1 payload', () => {
    const migrated = migratePersistedSettings({
      schemaVersion: 1,
      settings: {
        revision: 4,
        appearance: 'dark',
        defaultMode: 'split',
        autosave: true,
        remoteResources: 'block',
        lineNumbers: false,
        splitRatio: 0.6,
        syncScroll: false
      }
    })
    expect(migrated).toMatchObject({
      revision: 4,
      appearance: 'dark',
      defaultMode: 'split',
      autosave: true,
      autosaveDelayMs: 2000,
      imageStorage: 'beside-document'
    })
  })

  it('uses safe values for malformed optional settings', () => {
    const migrated = migratePersistedSettings({ schemaVersion: 1, settings: { revision: 2, remoteResources: 'anything', splitRatio: 9 } })
    expect(migrated?.remoteResources).toBe('block')
    expect(migrated?.splitRatio).toBe(0.85)
  })

  it('rejects unsupported future schemas', () => {
    expect(migratePersistedSettings({ schemaVersion: 99, settings: {} })).toBeNull()
  })
})
