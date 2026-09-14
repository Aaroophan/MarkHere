import { describe, expect, it, vi } from 'vitest'
import { PreviewRenderCoordinator } from './render-coordinator'

describe('PreviewRenderCoordinator', () => {
  it('resolves a debounced request as superseded instead of leaving its promise pending', async () => {
    vi.useFakeTimers()
    const coordinator = new PreviewRenderCoordinator(150)
    const first = coordinator.schedule({ documentId: 'd', revision: 1 }, async () => undefined)
    const second = coordinator.schedule({ documentId: 'd', revision: 2 }, async () => undefined)
    await expect(first).resolves.toBe('superseded')
    await vi.advanceTimersByTimeAsync(150)
    await expect(second).resolves.toBe('rendered')
    vi.useRealTimers()
  })

  it('cancels a pending request deterministically', async () => {
    const coordinator = new PreviewRenderCoordinator(1_000)
    const pending = coordinator.schedule({ documentId: 'd', revision: 1 }, async () => undefined)
    coordinator.cancel()
    await expect(pending).resolves.toBe('cancelled')
  })
})
