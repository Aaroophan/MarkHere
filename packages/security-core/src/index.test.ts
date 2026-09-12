import { describe, expect, it } from 'vitest'
import { classifyExternalProtocol } from './index'

describe('foundation external protocol policy', () => {
  it('allows the documented safe external protocols', () => {
    expect(classifyExternalProtocol('https:')).toBe('allow')
    expect(classifyExternalProtocol('mailto:')).toBe('allow')
  })

  it('denies dangerous/unapproved protocols by default', () => {
    expect(classifyExternalProtocol('javascript:')).toBe('deny')
    expect(classifyExternalProtocol('file:')).toBe('deny')
    expect(classifyExternalProtocol('data:')).toBe('deny')
  })
})
