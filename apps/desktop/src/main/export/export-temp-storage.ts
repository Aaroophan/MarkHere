import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicReplaceFile } from '../documents/atomic-write'

const STALE_AGE_MS = 24 * 60 * 60 * 1000

export class ExportTempStorage {
  readonly #root: string

  constructor(tempRoot: string) { this.#root = join(tempRoot, 'MarkHere', 'exports') }

  async initialize(): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    await this.cleanupStale()
  }

  async prepare(jobId: string): Promise<string> {
    const path = join(this.#root, jobId)
    await mkdir(path, { recursive: false })
    return path
  }

  async writeJobFile(jobId: string, name: 'render.html' | 'result.tmp', bytes: Uint8Array | string): Promise<string> {
    const path = join(this.#root, jobId, name)
    await writeFile(path, bytes, { flag: 'w', flush: true })
    return path
  }

  async commitFinal(targetPath: string, bytes: Uint8Array): Promise<void> {
    await atomicReplaceFile(targetPath, Buffer.from(bytes))
  }

  async cleanup(jobId: string): Promise<void> {
    await rm(join(this.#root, jobId), { recursive: true, force: true })
  }

  async cleanupStale(now = Date.now()): Promise<void> {
    let entries
    try { entries = await readdir(this.#root, { withFileTypes: true }) } catch { return }
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const path = join(this.#root, entry.name)
      try {
        const info = await stat(path)
        if (now - info.mtimeMs >= STALE_AGE_MS) await rm(path, { recursive: true, force: true })
      } catch { /* best-effort crash cleanup */ }
    }))
  }
}
