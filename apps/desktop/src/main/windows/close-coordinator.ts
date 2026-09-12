import type { BrowserWindow } from 'electron'

export type CloseDecision = 'allow' | 'deny'
export type CloseGuard = (window: BrowserWindow) => Promise<CloseDecision>

/**
 * Issue 2 owns the window-close orchestration point. Issue 3 registers the
 * dirty-document save/discard/cancel guard here without changing WindowManager.
 */
export class CloseCoordinator {
  readonly #guards = new Map<number, CloseGuard>()
  readonly #approvedClose = new Set<number>()

  register(window: BrowserWindow, guard: CloseGuard = async () => 'allow'): void {
    this.#guards.set(window.id, guard)
    window.once('closed', () => {
      this.#guards.delete(window.id)
      this.#approvedClose.delete(window.id)
    })
  }

  setGuard(windowId: number, guard: CloseGuard): void {
    this.#guards.set(windowId, guard)
  }

  isApproved(windowId: number): boolean {
    return this.#approvedClose.has(windowId)
  }

  consumeApproval(windowId: number): boolean {
    return this.#approvedClose.delete(windowId)
  }

  async request(window: BrowserWindow): Promise<boolean> {
    const guard = this.#guards.get(window.id)
    const decision = guard ? await guard(window) : 'allow'
    if (decision !== 'allow') return false
    this.#approvedClose.add(window.id)
    window.close()
    return true
  }
}
