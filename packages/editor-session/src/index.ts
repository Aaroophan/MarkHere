import type { DocumentMode, StructuralAnchor } from '@markhere/document-model'

/**
 * Stable editor-local command vocabulary shared by every editable surface.
 * These commands deliberately describe Markdown intent rather than Muya or
 * CodeMirror implementation details.
 */
export type EditorCommandId =
  | 'format.bold' | 'format.italic' | 'format.strikethrough' | 'format.link' | 'format.image'
  | 'paragraph.paragraph' | 'paragraph.heading1' | 'paragraph.heading2' | 'paragraph.heading3'
  | 'paragraph.heading4' | 'paragraph.heading5' | 'paragraph.heading6'
  | 'paragraph.bulletList' | 'paragraph.orderedList' | 'paragraph.taskList'
  | 'paragraph.blockquote' | 'paragraph.codeBlock' | 'paragraph.thematicBreak' | 'paragraph.table'
  | 'history.undo' | 'history.redo' | 'search.find' | 'search.replace'

export interface EditorCommandDefinition {
  readonly id: EditorCommandId
  readonly label: string
  readonly toolbar: boolean
}

export const EDITOR_COMMAND_DEFINITIONS: ReadonlyArray<EditorCommandDefinition> = Object.freeze([
  { id: 'format.bold', label: 'Bold', toolbar: true },
  { id: 'format.italic', label: 'Italic', toolbar: true },
  { id: 'format.strikethrough', label: 'Strike', toolbar: true },
  { id: 'format.link', label: 'Link', toolbar: true },
  { id: 'format.image', label: 'Image', toolbar: false },
  { id: 'paragraph.paragraph', label: 'Paragraph', toolbar: false },
  { id: 'paragraph.heading1', label: 'H1', toolbar: true },
  { id: 'paragraph.heading2', label: 'H2', toolbar: true },
  { id: 'paragraph.heading3', label: 'H3', toolbar: false },
  { id: 'paragraph.heading4', label: 'H4', toolbar: false },
  { id: 'paragraph.heading5', label: 'H5', toolbar: false },
  { id: 'paragraph.heading6', label: 'H6', toolbar: false },
  { id: 'paragraph.bulletList', label: 'Bullets', toolbar: true },
  { id: 'paragraph.orderedList', label: 'Numbered', toolbar: true },
  { id: 'paragraph.taskList', label: 'Tasks', toolbar: true },
  { id: 'paragraph.blockquote', label: 'Quote', toolbar: true },
  { id: 'paragraph.codeBlock', label: 'Code', toolbar: true },
  { id: 'paragraph.thematicBreak', label: 'Rule', toolbar: true },
  { id: 'paragraph.table', label: 'Table', toolbar: true },
  { id: 'history.undo', label: 'Undo', toolbar: false },
  { id: 'history.redo', label: 'Redo', toolbar: false },
  { id: 'search.find', label: 'Find', toolbar: false },
  { id: 'search.replace', label: 'Replace', toolbar: false }
])


export interface MarkdownSelectionOffsets {
  readonly anchor: number
  readonly head: number
}

export interface MarkdownCommandResult extends MarkdownSelectionOffsets {
  readonly markdown: string
}

function clampOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(length, Math.max(0, Math.trunc(value)))
}

function orderedSelection(markdown: string, selection: MarkdownSelectionOffsets): { from: number; to: number; backward: boolean } {
  const anchor = clampOffset(selection.anchor, markdown.length)
  const head = clampOffset(selection.head, markdown.length)
  return { from: Math.min(anchor, head), to: Math.max(anchor, head), backward: anchor > head }
}

function resultFromRange(markdown: string, from: number, to: number, backward: boolean): MarkdownCommandResult {
  return backward
    ? { markdown, anchor: to, head: from }
    : { markdown, anchor: from, head: to }
}

function replaceRange(
  markdown: string,
  selection: MarkdownSelectionOffsets,
  before: string,
  after = before,
  placeholder = ''
): MarkdownCommandResult {
  const { from, to, backward } = orderedSelection(markdown, selection)
  const selected = markdown.slice(from, to) || placeholder
  const inserted = `${before}${selected}${after}`
  const next = markdown.slice(0, from) + inserted + markdown.slice(to)
  return resultFromRange(next, from + before.length, from + before.length + selected.length, backward)
}

function lineBounds(markdown: string, selection: MarkdownSelectionOffsets): { start: number; end: number; backward: boolean } {
  const { from, to, backward } = orderedSelection(markdown, selection)
  const start = markdown.lastIndexOf('\n', Math.max(0, from - 1)) + 1
  const nextNewline = markdown.indexOf('\n', to)
  const end = nextNewline === -1 ? markdown.length : nextNewline
  return { start, end, backward }
}

function mapSelectedLines(
  markdown: string,
  selection: MarkdownSelectionOffsets,
  mapper: (line: string, index: number) => string
): MarkdownCommandResult {
  const { start, end, backward } = lineBounds(markdown, selection)
  const original = markdown.slice(start, end)
  const mapped = original.split('\n').map(mapper).join('\n')
  const next = markdown.slice(0, start) + mapped + markdown.slice(end)
  return resultFromRange(next, start, start + mapped.length, backward)
}

function stripBlockPrefix(line: string): string {
  return line.replace(/^ {0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
}

/**
 * Apply a MarkHere editor command directly to canonical Markdown text.
 *
 * Both Source and WYSIWYG adapters use this fallback for structural commands,
 * so mode-specific UI never invents a second formatting vocabulary. The
 * result is a new Markdown string plus a source-coordinate selection.
 */
export function applyMarkdownCommand(
  markdown: string,
  selection: MarkdownSelectionOffsets,
  command: EditorCommandId
): MarkdownCommandResult | null {
  switch (command) {
    case 'format.bold': return replaceRange(markdown, selection, '**', '**', 'bold text')
    case 'format.italic': return replaceRange(markdown, selection, '_', '_', 'italic text')
    case 'format.strikethrough': return replaceRange(markdown, selection, '~~', '~~', 'struck text')
    case 'format.link': return replaceRange(markdown, selection, '[', '](https://)', 'link text')
    case 'format.image': return replaceRange(markdown, selection, '![', '](image.png)', 'alt text')
    case 'paragraph.paragraph': return mapSelectedLines(markdown, selection, stripBlockPrefix)
    case 'paragraph.heading1':
    case 'paragraph.heading2':
    case 'paragraph.heading3':
    case 'paragraph.heading4':
    case 'paragraph.heading5':
    case 'paragraph.heading6': {
      const level = Number(command.at(-1))
      return mapSelectedLines(markdown, selection, (line) => `${'#'.repeat(level)} ${stripBlockPrefix(line)}`)
    }
    case 'paragraph.bulletList': return mapSelectedLines(markdown, selection, (line) => `- ${stripBlockPrefix(line)}`)
    case 'paragraph.orderedList': return mapSelectedLines(markdown, selection, (line, i) => `${i + 1}. ${stripBlockPrefix(line)}`)
    case 'paragraph.taskList': return mapSelectedLines(markdown, selection, (line) => `- [ ] ${stripBlockPrefix(line)}`)
    case 'paragraph.blockquote': return mapSelectedLines(markdown, selection, (line) => `> ${line.replace(/^>\s?/, '')}`)
    case 'paragraph.codeBlock': return replaceRange(markdown, selection, '```\n', '\n```', 'code')
    case 'paragraph.thematicBreak': return replaceRange(markdown, selection, '\n\n---\n\n', '', '')
    case 'paragraph.table': return replaceRange(markdown, selection, '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |', '', '')
    default: return null
  }
}

export type EditableSurface = 'source' | 'wysiwyg'
export type TransitionState = 'idle' | 'flushing' | 'activating' | 'rolling-back'

export interface CanonicalEditorSnapshot {
  readonly markdown: string
  readonly revision: number
}

export interface EditorNavigationSnapshot {
  readonly structuralAnchor?: StructuralAnchor
  readonly selection?: unknown
  readonly scrollTop?: number
}

export interface EditorFlushResult extends EditorNavigationSnapshot {
  readonly markdown: string
  readonly changed: boolean
}

export interface ModeControllerHooks {
  getCanonicalSnapshot(): CanonicalEditorSnapshot
  flush(surface: EditableSurface): Promise<EditorFlushResult> | EditorFlushResult
  commitFlushedMarkdown(surface: EditableSurface, result: EditorFlushResult): Promise<CanonicalEditorSnapshot> | CanonicalEditorSnapshot
  capture(surface: EditableSurface): EditorNavigationSnapshot
  deactivate(surface: EditableSurface): Promise<void> | void
  activate(mode: DocumentMode, snapshot: CanonicalEditorSnapshot, navigation: EditorNavigationSnapshot): Promise<void> | void
  setMode(mode: DocumentMode): Promise<void> | void
  onTransitionState?(state: TransitionState): void
}

export function editableSurfaceForMode(mode: DocumentMode): EditableSurface | null {
  if (mode === 'source' || mode === 'split') return 'source'
  return mode === 'wysiwyg' ? 'wysiwyg' : null
}

export const ALL_MODE_TRANSITIONS: ReadonlyArray<readonly [DocumentMode, DocumentMode]> = Object.freeze(
  (['preview', 'wysiwyg', 'source', 'split'] as const).flatMap((from) =>
    (['preview', 'wysiwyg', 'source', 'split'] as const)
      .filter((to) => to !== from)
      .map((to) => Object.freeze([from, to] as const))
  )
)

export class ModeTransitionError extends Error {
  constructor(readonly from: DocumentMode, readonly to: DocumentMode, options?: { cause?: unknown }) {
    super(`Unable to transition editor mode from ${from} to ${to}.`, options)
    this.name = 'ModeTransitionError'
  }
}

/**
 * Serializes all mode transitions around the canonical Markdown snapshot.
 * It never stores document text itself; the document model remains the sole source of truth.
 */
export class ModeController {
  #mode: DocumentMode
  #state: TransitionState = 'idle'
  #hooks: ModeControllerHooks
  #pending: Promise<void> = Promise.resolve()

  constructor(initialMode: DocumentMode, hooks: ModeControllerHooks) {
    this.#mode = initialMode
    this.#hooks = hooks
  }

  get mode(): DocumentMode { return this.#mode }
  get state(): TransitionState { return this.#state }

  transition(to: DocumentMode): Promise<void> {
    const run = this.#pending.then(() => this.#transitionNow(to))
    this.#pending = run.catch(() => undefined)
    return run
  }

  async flushActiveEditable(): Promise<CanonicalEditorSnapshot> {
    await this.#pending
    const surface = editableSurfaceForMode(this.#mode)
    if (!surface) return this.#hooks.getCanonicalSnapshot()
    this.#setState('flushing')
    try {
      const result = await this.#hooks.flush(surface)
      if (!result.changed) return this.#hooks.getCanonicalSnapshot()
      return await this.#hooks.commitFlushedMarkdown(surface, result)
    } finally {
      this.#setState('idle')
    }
  }

  async #transitionNow(to: DocumentMode): Promise<void> {
    if (to === this.#mode) return
    const from = this.#mode
    const outgoing = editableSurfaceForMode(from)
    const incoming = editableSurfaceForMode(to)
    let navigation: EditorNavigationSnapshot = {}

    try {
      if (outgoing) {
        this.#setState('flushing')
        const flushed = await this.#hooks.flush(outgoing)
        navigation = flushed
        if (flushed.changed) await this.#hooks.commitFlushedMarkdown(outgoing, flushed)
        else navigation = { ...this.#hooks.capture(outgoing), ...flushed }
      }

      if (outgoing && outgoing !== incoming) await this.#hooks.deactivate(outgoing)

      this.#setState('activating')
      const snapshot = this.#hooks.getCanonicalSnapshot()
      await this.#hooks.activate(to, snapshot, navigation)
      await this.#hooks.setMode(to)
      this.#mode = to
      this.#setState('idle')
    } catch (cause) {
      this.#setState('rolling-back')
      try {
        // Canonical Markdown is still safe. Prefer Source as the universal fallback,
        // otherwise restore the previous surface.
        const fallback: DocumentMode = to === 'source' ? from : 'source'
        const snapshot = this.#hooks.getCanonicalSnapshot()
        await this.#hooks.activate(fallback, snapshot, navigation)
        await this.#hooks.setMode(fallback)
        this.#mode = fallback
      } finally {
        this.#setState('idle')
      }
      throw new ModeTransitionError(from, to, { cause })
    }
  }

  #setState(state: TransitionState): void {
    this.#state = state
    this.#hooks.onTransitionState?.(state)
  }
}

export function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(0.85, Math.max(0.15, value))
}
