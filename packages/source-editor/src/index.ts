import { minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { redo, undo } from '@codemirror/commands'
import { closeSearchPanel, openSearchPanel, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import type { StructuralAnchor, TextPosition, TextRange } from '@markhere/document-model'
import { applyMarkdownCommand, type EditorCommandId } from '@markhere/editor-session'

export const SOURCE_EDITOR_ENGINE = 'CodeMirror 6' as const

export type SourceEditorCommand = EditorCommandId

export interface SourceEditorSelectionSnapshot {
  readonly cursor: TextPosition
  readonly selection: TextRange
  readonly scrollTop: number
  readonly structuralAnchor: StructuralAnchor
}

export interface SourceEditorChange {
  readonly markdown: string
  readonly selection: SourceEditorSelectionSnapshot
}

export interface SourceEditorOptions {
  readonly markdown: string
  readonly wrap?: boolean
  readonly lineNumbers?: boolean
  readonly dark?: boolean
  readonly onSelectionChange?: (selection: SourceEditorSelectionSnapshot) => void
  readonly onChange: (change: SourceEditorChange) => void
  readonly onScrollAnchor?: (anchor: StructuralAnchor) => void
}

function position(view: EditorView, offset: number): TextPosition {
  const line = view.state.doc.lineAt(Math.min(Math.max(0, offset), view.state.doc.length))
  return { line: line.number - 1, column: offset - line.from, offset }
}

function offsetFor(view: EditorView, value: TextPosition): number {
  const lineNo = Math.min(Math.max(1, value.line + 1), view.state.doc.lines)
  const line = view.state.doc.line(lineNo)
  return Math.min(line.to, line.from + Math.max(0, value.column))
}

export class SourceEditorAdapter {
  readonly #wrap = new Compartment()
  readonly #lineNumbers = new Compartment()
  readonly #theme = new Compartment()
  readonly #onChange: SourceEditorOptions['onChange']
  readonly #onSelectionChange?: SourceEditorOptions['onSelectionChange']
  readonly #onScrollAnchor?: SourceEditorOptions['onScrollAnchor']
  #view: EditorView
  #external = false
  #wrapEnabled: boolean
  #lineNumbersEnabled: boolean
  #dark: boolean
  #scrollHandler: (() => void) | null = null

  constructor(target: HTMLElement, options: SourceEditorOptions) {
    this.#onChange = options.onChange
    this.#onSelectionChange = options.onSelectionChange
    this.#onScrollAnchor = options.onScrollAnchor
    this.#wrapEnabled = options.wrap !== false
    this.#lineNumbersEnabled = options.lineNumbers !== false
    this.#dark = options.dark === true
    this.#view = new EditorView({ parent: target, state: this.#createState(options.markdown) })
    if (this.#onScrollAnchor) {
      const handler = (): void => this.#onScrollAnchor?.(this.captureStructuralAnchor())
      this.#view.scrollDOM.addEventListener('scroll', handler, { passive: true })
      this.#scrollHandler = () => this.#view.scrollDOM.removeEventListener('scroll', handler)
    }
  }

  get view(): EditorView { return this.#view }
  get markdown(): string { return this.#view.state.doc.toString() }

  flush(): SourceEditorChange {
    return { markdown: this.markdown, selection: this.captureSelection() }
  }

  applyExternalRevision(markdownText: string): void {
    if (markdownText === this.markdown) return
    const previous = this.captureSelection()
    this.#external = true
    try {
      // An authoritative canonical revision invalidates Source's private undo
      // branch. Rebuilding EditorState is stronger than merely marking a
      // transaction non-historical: old Source history can never be replayed
      // over a reload/recovery/WYSIWYG revision.
      this.#view.setState(this.#createState(markdownText))
    } finally { this.#external = false }
    this.restoreSelection({ cursor: previous.cursor })
  }

  setOptions(options: { wrap?: boolean; lineNumbers?: boolean; dark?: boolean }): void {
    const effects = []
    if (options.wrap !== undefined) {
      this.#wrapEnabled = options.wrap
      effects.push(this.#wrap.reconfigure(options.wrap ? EditorView.lineWrapping : []))
    }
    if (options.lineNumbers !== undefined) {
      this.#lineNumbersEnabled = options.lineNumbers
      effects.push(this.#lineNumbers.reconfigure(options.lineNumbers ? lineNumbers() : []))
    }
    if (options.dark !== undefined) {
      this.#dark = options.dark
      effects.push(this.#theme.reconfigure(this.#editorTheme(options.dark)))
    }
    if (effects.length) this.#view.dispatch({ effects })
  }

  captureSelection(): SourceEditorSelectionSnapshot {
    const selection = this.#view.state.selection.main
    return {
      cursor: position(this.#view, selection.head),
      selection: { anchor: position(this.#view, selection.anchor), head: position(this.#view, selection.head) },
      scrollTop: this.#view.scrollDOM.scrollTop,
      structuralAnchor: this.captureStructuralAnchor()
    }
  }

  restoreSelection(snapshot?: Partial<SourceEditorSelectionSnapshot>): void {
    const range = snapshot?.selection
    const cursor = snapshot?.cursor
    const anchor = range ? offsetFor(this.#view, range.anchor) : cursor ? offsetFor(this.#view, cursor) : 0
    const head = range ? offsetFor(this.#view, range.head) : anchor
    this.#view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
    if (snapshot?.scrollTop !== undefined) this.#view.scrollDOM.scrollTop = snapshot.scrollTop
  }

  captureStructuralAnchor(): StructuralAnchor {
    // CodeMirror's height queries use coordinates relative to the document's
    // top, not the scroller itself. Deriving the visible top from the live DOM
    // geometry remains correct when editor padding, transformed ancestors, or
    // other layout offsets are introduced later.
    const scrollerRect = this.#view.scrollDOM.getBoundingClientRect()
    const visibleTop = Math.max(0, scrollerRect.top - this.#view.documentTop)
    const top = this.#view.lineBlockAtHeight(visibleTop).from
    const pos = position(this.#view, top)
    return { sourceLine: pos.line, sourceOffset: pos.offset, intraBlockRatio: 0 }
  }

  scrollToStructuralAnchor(anchor: StructuralAnchor): void {
    const lineNo = anchor.sourceLine === undefined ? 1 : Math.min(this.#view.state.doc.lines, Math.max(1, anchor.sourceLine + 1))
    const line = this.#view.state.doc.line(lineNo)
    this.#view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
  }

  focus(): void { this.#view.focus() }
  undo(): boolean { return undo(this.#view) }
  redo(): boolean { return redo(this.#view) }
  openFind(): boolean { return openSearchPanel(this.#view) }
  closeFind(): boolean { return closeSearchPanel(this.#view) }


  insertMarkdown(text: string): void {
    const selection = this.#view.state.selection.main
    const cursor = selection.from + text.length
    this.#view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: cursor }, scrollIntoView: true })
    this.#view.focus()
  }

  execute(command: SourceEditorCommand): boolean {
    if (command === 'history.undo') return this.undo()
    if (command === 'history.redo') return this.redo()
    if (command === 'search.find' || command === 'search.replace') return this.openFind()

    const selection = this.#view.state.selection.main
    const result = applyMarkdownCommand(
      this.markdown,
      { anchor: selection.anchor, head: selection.head },
      command
    )
    if (!result) return false

    this.#view.dispatch({
      changes: { from: 0, to: this.#view.state.doc.length, insert: result.markdown },
      selection: { anchor: result.anchor, head: result.head },
      scrollIntoView: true
    })
    this.#view.focus()
    return true
  }


  #editorTheme(dark: boolean) {
    return EditorView.theme({
      '&': { height: '100%', fontSize: '14px', backgroundColor: dark ? '#111827' : '#ffffff', color: dark ? '#e5e7eb' : '#1f2328' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
      '.cm-content': { padding: '18px 0', caretColor: dark ? '#f8fafc' : '#111827' },
      '.cm-gutters': { backgroundColor: dark ? '#0f172a' : '#f8fafc', color: dark ? '#94a3b8' : '#64748b', border: '0' },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: dark ? '#1e293b' : '#f1f5f9' },
      '&.cm-focused': { outline: 'none' }
    }, { dark })
  }

  #createState(markdownText: string): EditorState {
    return EditorState.create({
      doc: markdownText,
      extensions: [
        minimalSetup,
        markdown(),
        keymap.of(searchKeymap),
        this.#wrap.of(this.#wrapEnabled ? EditorView.lineWrapping : []),
        this.#lineNumbers.of(this.#lineNumbersEnabled ? lineNumbers() : []),
        this.#theme.of(this.#editorTheme(this.#dark)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.#external) this.#onChange({ markdown: update.state.doc.toString(), selection: this.captureSelection() })
          else if (update.selectionSet && !this.#external) this.#onSelectionChange?.(this.captureSelection())
        })
      ]
    })
  }

  destroy(): void { this.#scrollHandler?.(); this.#scrollHandler = null; this.#view.destroy() }
}

export type { EditorState, EditorView }
