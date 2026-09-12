import { describe, expect, it } from 'vitest'
import type { Display } from 'electron'
import { clampWindowBounds } from '../../src/main/windows/window-bounds'

const display = {
  workArea: { x: 0, y: 0, width: 1920, height: 1080 }
} as Display

describe('window bounds', () => {
  it('brings an off-screen restored window back to a visible display', () => {
    const bounds = clampWindowBounds({ x: 9000, y: 9000, width: 1200, height: 800 }, [display])
    expect(bounds.x).toBeLessThanOrEqual(720)
    expect(bounds.y).toBeLessThanOrEqual(280)
  })
})
