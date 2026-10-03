import { app } from 'electron'
import { join } from 'node:path'
import { readJsonFile, writeJsonAtomic } from '../storage/json-atomic-store'
import { getApplicationStoragePaths } from '../storage/application-storage-paths'

interface StartupHealthState {
  readonly schemaVersion: 1
  readonly lastStart: string
  readonly lastCleanShutdown: boolean
  readonly consecutiveStartupFailures: number
}

const FAILURE_WINDOW_MS = 60_000
const SAFE_MODE_THRESHOLD = 2

export class CrashHealthService {
  readonly #path = join(getApplicationStoragePaths().appData, 'startup-health.json')
  #safeMode = false
  #state: StartupHealthState | null = null

  get safeMode(): boolean { return this.#safeMode }

  async markStarting(): Promise<boolean> {
    let previous: StartupHealthState | null = null
    try {
      const raw = await readJsonFile(this.#path) as Partial<StartupHealthState>
      if (raw.schemaVersion === 1 && typeof raw.lastStart === 'string' && typeof raw.lastCleanShutdown === 'boolean' && Number.isInteger(raw.consecutiveStartupFailures)) {
        previous = raw as StartupHealthState
      }
    } catch { /* missing/corrupt => safe default */ }
    const previousStart = previous ? Date.parse(previous.lastStart) : Number.NaN
    const rapidFailure = !!previous && !previous.lastCleanShutdown && Number.isFinite(previousStart) && Date.now() - previousStart < FAILURE_WINDOW_MS
    const failures = rapidFailure ? previous!.consecutiveStartupFailures + 1 : (previous && !previous.lastCleanShutdown ? 1 : 0)
    this.#safeMode = failures >= SAFE_MODE_THRESHOLD || process.argv.includes('--safe-mode')
    this.#state = { schemaVersion: 1, lastStart: new Date().toISOString(), lastCleanShutdown: false, consecutiveStartupFailures: failures }
    await writeJsonAtomic(this.#path, this.#state)
    return this.#safeMode
  }

  async markHealthy(): Promise<void> {
    if (!this.#state) return
    this.#state = { ...this.#state, consecutiveStartupFailures: 0 }
    await writeJsonAtomic(this.#path, this.#state)
  }

  async markCleanShutdown(): Promise<void> {
    const state: StartupHealthState = { schemaVersion: 1, lastStart: this.#state?.lastStart ?? new Date().toISOString(), lastCleanShutdown: true, consecutiveStartupFailures: 0 }
    this.#state = state
    await writeJsonAtomic(this.#path, state)
  }
}
