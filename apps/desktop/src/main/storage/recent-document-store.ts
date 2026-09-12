import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

interface RecentEntry { readonly id: string; readonly displayPath: string; readonly lastOpenedAt: string }
interface RecentFile { readonly schemaVersion: 1; readonly documents: readonly RecentEntry[] }

export class RecentDocumentStore {
  readonly #path = join(getApplicationStoragePaths().appData, 'recents.json')

  async add(displayPath: string): Promise<string> {
    const id = createHash('sha256').update(displayPath).digest('hex').slice(0, 32)
    const current = await this.#load()
    const documents = [{ id, displayPath, lastOpenedAt: new Date().toISOString() }, ...current.documents.filter((entry) => entry.id !== id)].slice(0, 50)
    await mkdir(getApplicationStoragePaths().appData, { recursive: true })
    await writeJsonAtomic(this.#path, { schemaVersion: 1, documents })
    return id
  }

  async resolve(id: string): Promise<string | null> {
    const current = await this.#load()
    return current.documents.find((entry) => entry.id === id)?.displayPath ?? null
  }

  async #load(): Promise<RecentFile> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf8')) as Partial<RecentFile>
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.documents)) return { schemaVersion: 1, documents: [] }
      return { schemaVersion: 1, documents: raw.documents.filter(validEntry) }
    } catch { return { schemaVersion: 1, documents: [] } }
  }
}

function validEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentEntry>
  return typeof item.id === 'string' && typeof item.displayPath === 'string' && typeof item.lastOpenedAt === 'string'
}
