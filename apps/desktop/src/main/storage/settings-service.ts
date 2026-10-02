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
  autosaveDelayMs: 2_000,
  remoteResources: 'block',
  lineNumbers: true,
  splitRatio: 0.5,
  syncScroll: true,
  imageStorage: 'beside-document'
})

interface PersistedSettings { readonly schemaVersion: number; readonly settings: unknown }

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSettings(value: unknown): MarkHereSettings | null {
  if (!isObject(value)) return null
  const revision = Number.isInteger(value.revision) && Number(value.revision) > 0 ? Number(value.revision) : 1
  const appearance = value.appearance === 'light' || value.appearance === 'dark' || value.appearance === 'system'
    ? value.appearance : DEFAULTS.appearance
  const defaultMode = value.defaultMode === 'preview' || value.defaultMode === 'wysiwyg' || value.defaultMode === 'source' || value.defaultMode === 'split'
    ? value.defaultMode : DEFAULTS.defaultMode
  const autosave = typeof value.autosave === 'boolean' ? value.autosave : DEFAULTS.autosave
  const autosaveDelayMs = typeof value.autosaveDelayMs === 'number' && Number.isInteger(value.autosaveDelayMs)
    ? Math.min(60_000, Math.max(500, value.autosaveDelayMs)) : DEFAULTS.autosaveDelayMs
  const remoteResources = value.remoteResources === 'block' || value.remoteResources === 'ask' || value.remoteResources === 'allow-https'
    ? value.remoteResources : DEFAULTS.remoteResources
  const lineNumbers = typeof value.lineNumbers === 'boolean' ? value.lineNumbers : DEFAULTS.lineNumbers
  const splitRatio = typeof value.splitRatio === 'number' && Number.isFinite(value.splitRatio)
    ? Math.min(0.85, Math.max(0.15, value.splitRatio)) : DEFAULTS.splitRatio
  const syncScroll = typeof value.syncScroll === 'boolean' ? value.syncScroll : DEFAULTS.syncScroll
  const imageStorage = value.imageStorage === 'data-uri' || value.imageStorage === 'beside-document'
    ? value.imageStorage : DEFAULTS.imageStorage

  return Object.freeze({
    revision,
    appearance,
    defaultMode,
    autosave,
    autosaveDelayMs,
    remoteResources,
    lineNumbers,
    splitRatio,
    syncScroll,
    imageStorage
  })
}

/**
 * Schema v1 is deliberately migration-capable. Earlier Issue-5 builds wrote a
 * valid v1 envelope without autosaveDelayMs/imageStorage; those fields are
 * filled with safe defaults rather than quarantining the whole settings file.
 */
export function migratePersistedSettings(raw: unknown): MarkHereSettings | null {
  if (!isObject(raw)) return null
  if (raw.schemaVersion === SCHEMA_VERSION) return normalizeSettings(raw.settings)
  if (raw.schemaVersion === 0 && isObject(raw.settings)) return normalizeSettings(raw.settings)
  // Pre-envelope development fixtures can still be imported safely.
  if ('appearance' in raw || 'defaultMode' in raw) return normalizeSettings(raw)
  return null
}

export class SettingsService {
  #loaded: MarkHereSettings | null = null
  readonly #path = join(getApplicationStoragePaths().appData, 'settings.json')
  readonly #onChanged: ((settings: MarkHereSettings) => void | Promise<void>) | undefined

  constructor(options?: { readonly onChanged?: (settings: MarkHereSettings) => void | Promise<void> }) {
    this.#onChanged = options?.onChanged
  }

  async get(): Promise<ApiResult<MarkHereSettings>> { return ok(await this.#load()) }

  async update(patch: SettingsPatch): Promise<ApiResult<MarkHereSettings>> {
    const current = await this.#load()
    if (patch.expectedRevision !== undefined && patch.expectedRevision !== current.revision) {
      return failure('SETTINGS_REVISION_CONFLICT', 'conflict', 'error.settingsRevisionConflict', true, {
        expected: patch.expectedRevision,
        actual: current.revision
      })
    }
    const { expectedRevision: _expected, ...changes } = patch
    const candidate = normalizeSettings({ ...current, ...changes, revision: current.revision + 1 })
    if (!candidate) return failure('SETTINGS_INVALID', 'validation', 'error.settingsInvalid', true)
    await this.#persist(candidate)
    return ok(candidate)
  }

  async reset(section?: SettingsSection): Promise<ApiResult<MarkHereSettings>> {
    const current = await this.#load()
    let changes: Partial<MarkHereSettings> = {}
    if (!section) changes = { ...DEFAULTS }
    else if (section === 'general') changes = { defaultMode: DEFAULTS.defaultMode }
    else if (section === 'appearance') changes = { appearance: DEFAULTS.appearance }
    else if (section === 'editor') {
      changes = {
        lineNumbers: DEFAULTS.lineNumbers,
        splitRatio: DEFAULTS.splitRatio,
        syncScroll: DEFAULTS.syncScroll
      }
    } else if (section === 'files') {
      changes = {
        autosave: DEFAULTS.autosave,
        autosaveDelayMs: DEFAULTS.autosaveDelayMs,
        remoteResources: DEFAULTS.remoteResources,
        imageStorage: DEFAULTS.imageStorage
      }
    }
    const candidate = normalizeSettings({ ...current, ...changes, revision: current.revision + 1 }) ?? DEFAULTS
    await this.#persist(candidate)
    return ok(candidate)
  }

  async #load(): Promise<MarkHereSettings> {
    if (this.#loaded) return this.#loaded
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8')) as PersistedSettings
      this.#loaded = migratePersistedSettings(parsed) ?? DEFAULTS
      if (this.#loaded !== DEFAULTS && (parsed.schemaVersion !== SCHEMA_VERSION || JSON.stringify(parsed.settings) !== JSON.stringify(this.#loaded))) {
        await writeJsonAtomic(this.#path, { schemaVersion: SCHEMA_VERSION, settings: this.#loaded })
      }
    } catch {
      this.#loaded = DEFAULTS
    }
    return this.#loaded
  }

  async #persist(settings: MarkHereSettings): Promise<void> {
    await writeJsonAtomic(this.#path, { schemaVersion: SCHEMA_VERSION, settings })
    this.#loaded = settings
    await this.#onChanged?.(settings)
  }
}

export { DEFAULTS as DEFAULT_MARKHERE_SETTINGS }
