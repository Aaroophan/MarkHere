export interface ScheduledPreviewRequest {
  readonly documentId: string
  readonly revision: number
}

export type ScheduledPreviewOutcome = 'rendered' | 'superseded' | 'cancelled' | 'failed'

export class PreviewRenderCoordinator {
  readonly #delayMs: number
  #sequence = 0
  #timer: ReturnType<typeof setTimeout> | null = null
  #controller: AbortController | null = null
  #pendingTimerResolve: ((outcome: ScheduledPreviewOutcome) => void) | null = null

  constructor(delayMs = 150) {
    this.#delayMs = Math.max(0, Math.min(delayMs, 1_000))
  }

  schedule<T extends ScheduledPreviewRequest>(
    request: T,
    execute: (request: T, signal: AbortSignal) => Promise<void>
  ): Promise<ScheduledPreviewOutcome> {
    const sequence = ++this.#sequence
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
      this.#pendingTimerResolve?.('superseded')
      this.#pendingTimerResolve = null
    }
    this.#controller?.abort('superseded')
    const controller = new AbortController()
    this.#controller = controller

    return new Promise((resolve) => {
      this.#pendingTimerResolve = resolve
      this.#timer = setTimeout(() => {
        this.#timer = null
        this.#pendingTimerResolve = null
        if (sequence !== this.#sequence) { resolve('superseded'); return }
        void execute(request, controller.signal).then(() => {
          if (controller.signal.aborted) resolve(sequence === this.#sequence ? 'cancelled' : 'superseded')
          else if (sequence !== this.#sequence) resolve('superseded')
          else resolve('rendered')
        }).catch(() => {
          resolve(controller.signal.aborted
            ? (sequence === this.#sequence ? 'cancelled' : 'superseded')
            : 'failed')
        })
      }, this.#delayMs)
    })
  }

  cancel(): void {
    this.#sequence += 1
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    this.#pendingTimerResolve?.('cancelled')
    this.#pendingTimerResolve = null
    this.#controller?.abort('cancelled')
    this.#controller = null
  }
}
