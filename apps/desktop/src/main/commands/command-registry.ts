import { BrowserWindow } from 'electron'
import type { AppCommandEvent, CommandId } from '@markhere/ipc-contract'
import type { RendererEventDispatcher } from '../ipc/renderer-events'

export type CommandCondition = 'always' | 'document' | 'saveable-document' | 'editable-document'

export interface CommandDefinition {
  readonly id: CommandId
  readonly label: string
  readonly accelerator?: string
  readonly target: 'renderer' | 'main'
  readonly when: CommandCondition
}

export interface CommandContext {
  readonly hasDocument: boolean
  readonly canSave: boolean
  readonly editable: boolean
}

const EMPTY_CONTEXT: CommandContext = Object.freeze({
  hasDocument: false,
  canSave: false,
  editable: false
})

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = Object.freeze([
  { id: 'file.new', label: 'New', accelerator: 'CmdOrCtrl+N', target: 'renderer', when: 'always' },
  { id: 'file.open', label: 'Open…', accelerator: 'CmdOrCtrl+O', target: 'renderer', when: 'always' },
  { id: 'file.openFolder', label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', target: 'renderer', when: 'always' },
  { id: 'file.save', label: 'Save', accelerator: 'CmdOrCtrl+S', target: 'renderer', when: 'saveable-document' },
  { id: 'file.saveAs', label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', target: 'renderer', when: 'document' },
  { id: 'file.export.html', label: 'Export HTML…', target: 'renderer', when: 'document' },
  { id: 'file.export.pdf', label: 'Export PDF…', target: 'renderer', when: 'document' },
  { id: 'file.export.docx', label: 'Export Word…', target: 'renderer', when: 'document' },
  { id: 'view.mode.preview', label: 'Preview', accelerator: 'CmdOrCtrl+1', target: 'renderer', when: 'document' },
  { id: 'view.mode.wysiwyg', label: 'WYSIWYG', accelerator: 'CmdOrCtrl+2', target: 'renderer', when: 'document' },
  { id: 'view.mode.source', label: 'Source', accelerator: 'CmdOrCtrl+3', target: 'renderer', when: 'document' },
  { id: 'view.mode.split', label: 'Split', accelerator: 'CmdOrCtrl+4', target: 'renderer', when: 'document' },
  { id: 'edit.find', label: 'Find', accelerator: 'CmdOrCtrl+F', target: 'renderer', when: 'document' },
  { id: 'edit.replace', label: 'Replace', accelerator: 'CmdOrCtrl+H', target: 'renderer', when: 'editable-document' },
  { id: 'app.settings', label: 'Settings', accelerator: 'CmdOrCtrl+,', target: 'renderer', when: 'always' },
  { id: 'app.quit', label: 'Quit', accelerator: 'CmdOrCtrl+Q', target: 'main', when: 'always' }
])

export class ApplicationCommandRegistry {
  readonly #events: RendererEventDispatcher
  readonly #onQuit: () => void
  readonly #contexts = new Map<number, CommandContext>()
  readonly #changeListeners = new Set<() => void>()

  constructor(events: RendererEventDispatcher, onQuit: () => void) {
    this.#events = events
    this.#onQuit = onQuit
  }

  definition(id: CommandId): CommandDefinition | undefined {
    return COMMAND_DEFINITIONS.find((definition) => definition.id === id)
  }

  setContext(webContentsId: number, context: CommandContext): void {
    this.#contexts.set(webContentsId, Object.freeze({ ...context }))
    this.#emitChanged()
  }

  clearContext(webContentsId: number): void {
    if (this.#contexts.delete(webContentsId)) this.#emitChanged()
  }

  onChanged(listener: () => void): () => void {
    this.#changeListeners.add(listener)
    return () => this.#changeListeners.delete(listener)
  }

  isEnabled(id: CommandId, target = BrowserWindow.getFocusedWindow()): boolean {
    const definition = this.definition(id)
    if (!definition) return false
    if (definition.when === 'always') return true
    if (!target || target.isDestroyed()) return false
    const context = this.#contexts.get(target.webContents.id) ?? EMPTY_CONTEXT
    switch (definition.when) {
      case 'document': return context.hasDocument
      case 'saveable-document': return context.hasDocument && context.canSave
      case 'editable-document': return context.hasDocument && context.editable
      default: return false
    }
  }

  dispatch(id: CommandId, source: AppCommandEvent['source'], target = BrowserWindow.getFocusedWindow()): boolean {
    const definition = this.definition(id)
    if (!definition || !this.isEnabled(id, target)) return false
    if (definition.target === 'main') {
      if (id === 'app.quit') this.#onQuit()
      return true
    }
    if (!target || target.isDestroyed()) return false
    this.#events.sendAppCommand(target, { id, source })
    return true
  }

  #emitChanged(): void {
    for (const listener of this.#changeListeners) listener()
  }
}
