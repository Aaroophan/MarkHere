import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiResult, MarkHereSettings, SettingsPatch, SettingsSection } from '@markhere/ipc-contract'
import { failure, ok } from '../services/api-results'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

const SCHEMA_VERSION = 1
const DEFAULTS: MarkHereSettings = Object.freeze({
  revision: 1,
  appearance: 'system',
  defaultMode: 'preview',
  autosave: false,
  remoteResources: 'block',
  lineNumbers: true,
  splitRatio: 0.5,
  syncScroll: true
})

interface PersistedSettings { schemaVersion: number; settings: MarkHereSettings }

function valid(value: unknown): value is MarkHereSettings {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return Number.isInteger(s.revision) && (s.appearance === 'light' || s.appearance === 'dark' || s.appearance === 'system') &&
    (s.defaultMode === 'preview' || s.defaultMode === 'wysiwyg' || s.defaultMode === 'source' || s.defaultMode === 'split') &&
    typeof s.autosave === 'boolean' && (s.remoteResources === 'block' || s.remoteResources === 'ask' || s.remoteResources === 'allow-https') &&
    typeof s.lineNumbers === 'boolean' && typeof s.splitRatio === 'number' && s.splitRatio >= 0.15 && s.splitRatio <= 0.85 && typeof s.syncScroll === 'boolean'
}

export class SettingsService {
  #loaded: MarkHereSettings | null = null
  readonly #path = join(getApplicationStoragePaths().appData, 'settings.json')

  async get(): Promise<ApiResult<MarkHereSettings>> { return ok(await this.#load()) }

  async update(patch: SettingsPatch): Promise<ApiResult<MarkHereSettings>> {
    const current = await this.#load()
    if (patch.expectedRevision !== undefined && patch.expectedRevision !== current.revision) {
      return failure('SETTINGS_REVISION_CONFLICT', 'conflict', 'error.settingsRevisionConflict', true, { expected: patch.expectedRevision, actual: current.revision })
    }
    const { expectedRevision: _expected, ...changes } = patch
    const next: MarkHereSettings = Object.freeze({
      ...current,
      ...changes,
      splitRatio: changes.splitRatio === undefined ? current.splitRatio : Math.min(0.85, Math.max(0.15, changes.splitRatio)),
      revision: current.revision + 1
    })
    await this.#persist(next)
    return ok(next)
  }

  async reset(section?: SettingsSection): Promise<ApiResult<MarkHereSettings>> {
    const current = await this.#load()
    let changes: Partial<MarkHereSettings> = {}
    if (!section) changes = { ...DEFAULTS }
    else if (section === 'appearance') changes = { appearance: DEFAULTS.appearance }
    else if (section === 'editor') changes = { defaultMode: DEFAULTS.defaultMode, lineNumbers: DEFAULTS.lineNumbers, splitRatio: DEFAULTS.splitRatio, syncScroll: DEFAULTS.syncScroll }
    else if (section === 'files') changes = { autosave: DEFAULTS.autosave, remoteResources: DEFAULTS.remoteResources }
    const next: MarkHereSettings = Object.freeze({ ...current, ...changes, revision: current.revision + 1 })
    await this.#persist(next)
    return ok(next)
  }

  async #load(): Promise<MarkHereSettings> {
    if (this.#loaded) return this.#loaded
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8')) as PersistedSettings
      if (parsed.schemaVersion === SCHEMA_VERSION && valid(parsed.settings)) this.#loaded = Object.freeze({ ...parsed.settings })
      else this.#loaded = DEFAULTS
    } catch { this.#loaded = DEFAULTS }
    return this.#loaded
  }

  async #persist(settings: MarkHereSettings): Promise<void> {
    await writeJsonAtomic(this.#path, { schemaVersion: SCHEMA_VERSION, settings })
    this.#loaded = settings
  }
}

export { DEFAULTS as DEFAULT_MARKHERE_SETTINGS }
