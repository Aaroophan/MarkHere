import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiResult, CommandId, KeybindingConfig } from '@markhere/ipc-contract'
import { failure, ok } from '../services/api-results'
import { getApplicationStoragePaths } from './application-storage-paths'
import { writeJsonAtomic } from './json-atomic-store'

const SCHEMA_VERSION = 1

export const DEFAULT_KEYBINDINGS: Readonly<Record<CommandId, string>> = Object.freeze({
  'file.new': 'CmdOrCtrl+N',
  'file.open': 'CmdOrCtrl+O',
  'file.openFolder': 'CmdOrCtrl+Shift+O',
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'CmdOrCtrl+Shift+S',
  'file.export.html': '',
  'file.export.pdf': '',
  'file.export.docx': '',
  'view.mode.preview': 'CmdOrCtrl+1',
  'view.mode.wysiwyg': 'CmdOrCtrl+2',
  'view.mode.source': 'CmdOrCtrl+3',
  'view.mode.split': 'CmdOrCtrl+4',
  'edit.find': 'CmdOrCtrl+F',
  'edit.replace': 'CmdOrCtrl+H',
  'app.settings': 'CmdOrCtrl+,',
  'app.commandPalette': 'CmdOrCtrl+Shift+P',
  'app.quit': 'CmdOrCtrl+Q'
})

const COMMAND_IDS = new Set<CommandId>(Object.keys(DEFAULT_KEYBINDINGS) as CommandId[])
const MODIFIER_ORDER = ['CmdOrCtrl', 'Ctrl', 'Cmd', 'Alt', 'Shift'] as const
const MODIFIER_ALIASES: Readonly<Record<string, typeof MODIFIER_ORDER[number]>> = Object.freeze({
  cmdorctrl: 'CmdOrCtrl', commandorcontrol: 'CmdOrCtrl', ctrl: 'Ctrl', control: 'Ctrl',
  cmd: 'Cmd', command: 'Cmd', meta: 'Cmd', alt: 'Alt', option: 'Alt', shift: 'Shift'
})

export function normalizeKeybinding(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parts = trimmed.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const keyRaw = parts.pop() ?? ''
  if (!keyRaw || keyRaw.length > 24 || /\s/u.test(keyRaw)) return null
  const modifiers = new Set<typeof MODIFIER_ORDER[number]>()
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLocaleLowerCase('en-US')]
    if (!modifier) return null
    modifiers.add(modifier)
  }
  if (modifiers.has('CmdOrCtrl') && (modifiers.has('Ctrl') || modifiers.has('Cmd'))) return null
  const key = keyRaw.length === 1 ? keyRaw.toUpperCase() : keyRaw[0]!.toUpperCase() + keyRaw.slice(1)
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+')
}

function validateBindings(bindings: Readonly<Record<string, string>>): { ok: true; bindings: Record<string, string> } | { ok: false; code: string; details?: Record<string, string> } {
  const normalized: Record<string, string> = {}
  const used = new Map<string, string>()
  for (const [commandId, shortcut] of Object.entries(bindings)) {
    if (!COMMAND_IDS.has(commandId as CommandId)) return { ok: false, code: 'KEYBINDING_UNKNOWN_COMMAND', details: { commandId } }
    const next = normalizeKeybinding(shortcut)
    if (next === null) return { ok: false, code: 'KEYBINDING_INVALID', details: { commandId } }
    if (next) {
      const collision = used.get(next.toLocaleLowerCase('en-US'))
      if (collision) return { ok: false, code: 'KEYBINDING_COLLISION', details: { commandId, collision } }
      used.set(next.toLocaleLowerCase('en-US'), commandId)
    }
    normalized[commandId] = next
  }
  return { ok: true, bindings: normalized }
}

interface PersistedKeybindings { readonly schemaVersion: number; readonly config: unknown }

export class KeybindingService {
  #loaded: KeybindingConfig | null = null
  readonly #path = join(getApplicationStoragePaths().appData, 'keybindings.json')
  readonly #onChanged: ((config: KeybindingConfig) => void | Promise<void>) | undefined

  constructor(options?: { readonly onChanged?: (config: KeybindingConfig) => void | Promise<void> }) {
    this.#onChanged = options?.onChanged
  }

  async get(): Promise<ApiResult<KeybindingConfig>> { return ok(await this.#load()) }

  async update(input: KeybindingConfig): Promise<ApiResult<KeybindingConfig>> {
    const current = await this.#load()
    if (input.revision !== current.revision) {
      return failure('KEYBINDING_REVISION_CONFLICT', 'conflict', 'error.keybindingRevisionConflict', true, {
        expected: input.revision,
        actual: current.revision
      })
    }
    const requested = Object.keys(input.bindings).length === 0 ? DEFAULT_KEYBINDINGS : input.bindings
    const merged = { ...DEFAULT_KEYBINDINGS, ...requested }
    const validation = validateBindings(merged)
    if (!validation.ok) {
      return failure(validation.code, 'validation', 'error.keybindingInvalid', true, validation.details)
    }
    const next: KeybindingConfig = Object.freeze({ revision: current.revision + 1, bindings: Object.freeze(validation.bindings) })
    await this.#persist(next)
    return ok(next)
  }

  async #load(): Promise<KeybindingConfig> {
    if (this.#loaded) return this.#loaded
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf8')) as PersistedKeybindings
      if (raw.schemaVersion !== SCHEMA_VERSION || !raw.config || typeof raw.config !== 'object') throw new Error('unsupported schema')
      const candidate = raw.config as { revision?: unknown; bindings?: unknown }
      if (!Number.isInteger(candidate.revision) || typeof candidate.bindings !== 'object' || candidate.bindings === null) throw new Error('invalid config')
      const validation = validateBindings({ ...DEFAULT_KEYBINDINGS, ...(candidate.bindings as Record<string, string>) })
      if (!validation.ok) throw new Error(validation.code)
      this.#loaded = Object.freeze({ revision: Number(candidate.revision), bindings: Object.freeze(validation.bindings) })
    } catch {
      this.#loaded = Object.freeze({ revision: 1, bindings: DEFAULT_KEYBINDINGS })
    }
    return this.#loaded
  }

  async #persist(config: KeybindingConfig): Promise<void> {
    await writeJsonAtomic(this.#path, { schemaVersion: SCHEMA_VERSION, config })
    this.#loaded = config
    await this.#onChanged?.(config)
  }
}
