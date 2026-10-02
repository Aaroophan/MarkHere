import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { basename, join, normalize } from 'node:path'
import type { RecentItemDTO } from '@markhere/ipc-contract'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

interface RecentEntry {
  readonly id: string
  readonly kind: 'file' | 'workspace'
  readonly displayPath: string
  readonly lastOpenedAt: string
}

interface RecentFile { readonly schemaVersion: 1; readonly items: readonly RecentEntry[] }
interface LegacyRecentFile { readonly schemaVersion?: number; readonly documents?: readonly Omit<RecentEntry, 'kind'>[] }

function pathKey(path: string): string {
  const normalized = normalize(path).normalize('NFC')
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

function idFor(kind: RecentEntry['kind'], displayPath: string): string {
  return createHash('sha256').update(`${kind}:${pathKey(displayPath)}`).digest('hex').slice(0, 32)
}

function dto(entry: RecentEntry): RecentItemDTO {
  return {
    id: entry.id,
    kind: entry.kind,
    displayPath: entry.displayPath,
    basename: basename(entry.displayPath) || entry.displayPath,
    lastOpenedAt: entry.lastOpenedAt
  }
}

export class RecentDocumentStore {
  readonly #path = join(getApplicationStoragePaths().appData, 'recent.json')
  readonly #legacyPath = join(getApplicationStoragePaths().appData, 'recents.json')

  async add(displayPath: string): Promise<string> { return this.addDocument(displayPath) }
  async resolve(id: string): Promise<string | null> { return this.resolveDocument(id) }

  async addDocument(displayPath: string): Promise<string> { return this.#add('file', displayPath) }
  async addWorkspace(displayPath: string): Promise<string> { return this.#add('workspace', displayPath) }

  async listDocuments(): Promise<RecentItemDTO[]> {
    return (await this.#load()).items.filter((entry) => entry.kind === 'file').map(dto)
  }

  async listWorkspaces(): Promise<RecentItemDTO[]> {
    return (await this.#load()).items.filter((entry) => entry.kind === 'workspace').map(dto)
  }

  async resolveDocument(id: string): Promise<string | null> { return this.#resolve(id, 'file') }
  async resolveWorkspace(id: string): Promise<string | null> { return this.#resolve(id, 'workspace') }

  async remove(id: string, kind?: RecentEntry['kind']): Promise<void> {
    const current = await this.#load()
    const items = current.items.filter((entry) => entry.id !== id || (kind !== undefined && entry.kind !== kind))
    if (items.length !== current.items.length) await this.#persist(items)
  }

  async clear(kind?: RecentEntry['kind']): Promise<void> {
    const current = await this.#load()
    const items = kind ? current.items.filter((entry) => entry.kind !== kind) : []
    await this.#persist(items)
  }

  async #add(kind: RecentEntry['kind'], displayPath: string): Promise<string> {
    const id = idFor(kind, displayPath)
    const current = await this.#load()
    const next: RecentEntry = { id, kind, displayPath, lastOpenedAt: new Date().toISOString() }
    const items = [next, ...current.items.filter((entry) => entry.id !== id || entry.kind !== kind)].slice(0, 100)
    await this.#persist(items)
    return id
  }

  async #resolve(id: string, kind: RecentEntry['kind']): Promise<string | null> {
    const current = await this.#load()
    return current.items.find((entry) => entry.id === id && entry.kind === kind)?.displayPath ?? null
  }

  async #load(): Promise<RecentFile> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf8')) as Partial<RecentFile>
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.items)) return { schemaVersion: 1, items: [] }
      return { schemaVersion: 1, items: raw.items.filter(validEntry).slice(0, 100) }
    } catch {
      const migrated = await this.#migrateLegacy()
      return migrated ?? { schemaVersion: 1, items: [] }
    }
  }

  async #migrateLegacy(): Promise<RecentFile | null> {
    try {
      const raw = JSON.parse(await readFile(this.#legacyPath, 'utf8')) as LegacyRecentFile
      const documents = Array.isArray(raw.documents) ? raw.documents : []
      const items = documents.flatMap((entry) => {
        if (!validLegacyEntry(entry)) return []
        return [{ ...entry, id: idFor('file', entry.displayPath), kind: 'file' as const }]
      })
      await this.#persist(items)
      await unlink(this.#legacyPath).catch(() => undefined)
      return { schemaVersion: 1, items }
    } catch { return null }
  }

  async #persist(items: readonly RecentEntry[]): Promise<void> {
    await mkdir(getApplicationStoragePaths().appData, { recursive: true })
    await writeJsonAtomic(this.#path, { schemaVersion: 1, items })
  }
}

function validEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentEntry>
  return typeof item.id === 'string' && (item.kind === 'file' || item.kind === 'workspace') &&
    typeof item.displayPath === 'string' && typeof item.lastOpenedAt === 'string'
}

function validLegacyEntry(value: unknown): value is Omit<RecentEntry, 'kind'> {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentEntry>
  return typeof item.id === 'string' && typeof item.displayPath === 'string' && typeof item.lastOpenedAt === 'string'
}
