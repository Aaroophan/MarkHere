import { describe, expect, it } from 'vitest'
import type { BrowserWindow } from 'electron'
import { CloseCoordinator } from '../../src/main/windows/close-coordinator'

function fakeWindow(id = 1): { window: BrowserWindow; closed: () => number } {
  let closeCount = 0
  const listeners: Array<() => void> = []
  const window = {
    id,
    once: (event: string, cb: () => void) => {
      if (event === 'closed') listeners.push(cb)
      return window
    },
    close: () => { closeCount += 1 }
  } as unknown as BrowserWindow
  return { window, closed: () => closeCount }
}

describe('CloseCoordinator', () => {
  it('does not close when the window-specific guard cancels', async () => {
    const coordinator = new CloseCoordinator()
    const fake = fakeWindow()
    coordinator.register(fake.window, async () => 'deny')

    await expect(coordinator.request(fake.window)).resolves.toBe(false)
    expect(fake.closed()).toBe(0)
  })

  it('marks one close attempt as approved after the guard allows it', async () => {
    const coordinator = new CloseCoordinator()
    const fake = fakeWindow()
    coordinator.register(fake.window, async () => 'allow')

    await expect(coordinator.request(fake.window)).resolves.toBe(true)
    expect(fake.closed()).toBe(1)
    expect(coordinator.consumeApproval(fake.window.id)).toBe(true)
    expect(coordinator.consumeApproval(fake.window.id)).toBe(false)
  })
})
