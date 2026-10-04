import { describe, expect, it } from 'vitest'
import { channelForVersion } from '../../src/main/services/update-service'

describe('FR-UPD-001 update channel selection', () => {
  it('keeps stable, beta and alpha streams separate', () => {
    expect(channelForVersion('1.0.0')).toBe('stable')
    expect(channelForVersion('1.1.0-beta.2')).toBe('beta')
    expect(channelForVersion('2.0.0-alpha.9')).toBe('alpha')
  })
})
