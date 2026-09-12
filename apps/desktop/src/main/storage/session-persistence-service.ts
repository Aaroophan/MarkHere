import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

export interface PersistedTabReference {
  readonly displayPath?: string
  readonly recoverySnapshotId?: string
  readonly mode: 'preview' | 'wysiwyg' | 'source' | 'split'
  readonly pinned?: boolean
}

export interface PersistedWindowState {
  readonly schemaVersion: 1
  readonly id: string
  readonly bounds: { readonly x?: number; readonly y?: number; readonly width: number; readonly height: number; readonly maximized: boolean; readonly fullscreen: boolean }
  readonly sidebar: { readonly visible: boolean; readonly width: number; readonly activePanel: 'files' | 'outline' | 'search' }
  readonly tabs: readonly PersistedTabReference[]
  readonly activeDocumentId?: string
}

export interface WindowStateFileV1 { readonly schemaVersion: 1; readonly windows: readonly PersistedWindowState[] }
interface WindowStateFileV0 { readonly schemaVersion: 0; readonly windows?: readonly unknown[] }

export function migrateWindowStatePayload(raw: unknown): WindowStateFileV1 {
  if (!raw || typeof raw !== 'object') throw new Error('Window state payload is not an object.')
  const value = raw as Partial<WindowStateFileV1 & WindowStateFileV0>
  if (value.schemaVersion === 1 && Array.isArray(value.windows)) {
    return { schemaVersion: 1, windows: value.windows.filter(validWindow) }
  }
  if (value.schemaVersion === 0) {
    // v0 did not have a stable tab/window shape. Discarding that metadata is
    // safer than guessing; recovery/user Markdown remain separate and intact.
    return { schemaVersion: 1, windows: [] }
  }
  throw new Error('Unsupported session schema.')
}

export class SessionPersistenceService {
  readonly #path = join(getApplicationStoragePaths().sessions, 'windows.json')

  async load(): Promise<WindowStateFileV1> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf8')) as unknown
      return migrateWindowStatePayload(raw)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, windows: [] }
      await this.#preserveInvalid().catch(() => undefined)
      return { schemaVersion: 1, windows: [] }
    }
  }

  async save(windows: readonly PersistedWindowState[]): Promise<void> {
    await mkdir(getApplicationStoragePaths().sessions, { recursive: true, mode: 0o700 })
    await writeJsonAtomic(this.#path, { schemaVersion: 1, windows })
  }

  async #preserveInvalid(): Promise<void> {
    await mkdir(getApplicationStoragePaths().sessions, { recursive: true, mode: 0o700 })
    await rename(this.#path, `${this.#path}.invalid-${Date.now()}-${randomUUID()}.bak`)
  }
}

function validWindow(value: unknown): value is PersistedWindowState {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<PersistedWindowState>
  return input.schemaVersion === 1
    && typeof input.id === 'string'
    && !!input.bounds
    && typeof input.bounds.width === 'number'
    && typeof input.bounds.height === 'number'
    && Array.isArray(input.tabs)
    && !!input.sidebar
}
