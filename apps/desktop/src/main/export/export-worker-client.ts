import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { ExportWorkerRequest, ExportWorkerResponse } from '../../workers/export-worker-protocol'

const DEFAULT_TIMEOUT_MS = 90_000

function workerEntryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'export-worker.js')
}

export class ExportWorkerClient {
  readonly #active = new Set<UtilityProcess>()

  async run(
    request: Omit<ExportWorkerRequest, 'requestId'>,
    signal: AbortSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Extract<ExportWorkerResponse, { type: 'result' }>> {
    if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError')
    const requestId = randomUUID()
    const child = utilityProcess.fork(workerEntryPath())
    this.#active.add(child)

    return await new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.#active.delete(child)
        child.kill()
        callback()
      }
      const onAbort = (): void => finish(() => reject(new DOMException('Export cancelled.', 'AbortError')))
      const timer = setTimeout(() => finish(() => reject(new Error('Export worker timed out.'))), timeoutMs)
      timer.unref?.()
      signal.addEventListener('abort', onAbort, { once: true })
      child.on('message', (message: ExportWorkerResponse) => {
        if (!message || message.requestId !== requestId) return
        if (message.type === 'error') finish(() => reject(new Error(`${message.code}: ${message.message}`)))
        else finish(() => resolve(message))
      })
      child.on('exit', (code) => {
        if (!settled && code !== 0) finish(() => reject(new Error(`Export worker exited with code ${code}.`)))
      })
      child.on('spawn', () => {
        const payload = { ...request, requestId } as ExportWorkerRequest
        child.postMessage(payload)
      })
    })
  }

  closeAll(): void {
    for (const child of this.#active) child.kill()
    this.#active.clear()
  }
}
