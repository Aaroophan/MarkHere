import { describe, expect, it } from 'vitest'
import { migrateWindowStatePayload } from '../../src/main/storage/session-persistence-service'

describe('session persistence migrations', () => {
  it('migrates the legacy v0 envelope to a safe empty v1 layout', () => {
    expect(migrateWindowStatePayload({ schemaVersion: 0, windows: [{ legacy: true }] })).toEqual({ schemaVersion: 1, windows: [] })
  })

  it('rejects unsupported/corrupt schemas instead of guessing', () => {
    expect(() => migrateWindowStatePayload({ schemaVersion: 99, windows: [] })).toThrow('Unsupported session schema')
    expect(() => migrateWindowStatePayload(null)).toThrow()
  })
})
