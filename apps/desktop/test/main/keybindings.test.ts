import { describe, expect, it } from 'vitest'
import { normalizeKeybinding } from '../../src/main/storage/keybinding-service'

describe('Issue 6 keybinding normalization', () => {
  it('normalizes aliases and modifier order', () => {
    expect(normalizeKeybinding('shift + control + s')).toBe('Ctrl+Shift+S')
    expect(normalizeKeybinding('commandorcontrol+shift+p')).toBe('CmdOrCtrl+Shift+P')
  })

  it('allows commands to be intentionally unbound', () => {
    expect(normalizeKeybinding('')).toBe('')
  })

  it('rejects invalid or contradictory modifiers', () => {
    expect(normalizeKeybinding('CmdOrCtrl+Ctrl+S')).toBeNull()
    expect(normalizeKeybinding('Hyper+S')).toBeNull()
  })
})
