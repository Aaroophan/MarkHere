import { describe, expect, it } from 'vitest'
import { MARKHERE_IDENTITY, MARKHERE_PRODUCT_NAME } from './index'

describe('MarkHere product identity', () => {
  it('uses an independent product/data namespace', () => {
    expect(MARKHERE_PRODUCT_NAME).toBe('MarkHere')
    expect(MARKHERE_IDENTITY.appId).toBe('com.markhere.desktop')
    expect(MARKHERE_IDENTITY.userDataFolder).toBe('MarkHere')
    expect(MARKHERE_IDENTITY.appProtocol).toBe('markhere')
    expect(MARKHERE_IDENTITY.resourceProtocol).toBe('markhere-resource')
    expect(MARKHERE_IDENTITY.ipcPrefix).toBe('mh:v1')
    expect(JSON.stringify(MARKHERE_IDENTITY)).not.toContain('MarkText')
  })
})
