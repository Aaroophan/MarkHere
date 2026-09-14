import {
  CodeBlockLanguageSelector,
  ImageEditTool,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu
} from '@muyajs/core'
import '@muyajs/core/lib/style.css'
import type { StructuralAnchor, TextPosition, TextRange } from '@markhere/document-model'
import { applyMarkdownCommand, type EditorCommandId } from '@markhere/editor-session'
import {
  absoluteOffset,
  drainPendingMuyaFrame,
  getIndexCursor,
  nativeCanRedo,
  nativeCanUndo,
  nativeUndoDepth,
  positionAt,
  restoreNativeRedo,
  setContentPreservingHistory,
  setIndexCursor,
  takeNativeRedo,
  type IndexCursor
} from './muya-v020-compat'

export const WYSIWYG_EDITOR_ENGINE = '@muyajs/core 0.2.0 with MarkHere compatibility adapter' as const

export type WysiwygEditorCommand = EditorCommandId

export interface WysiwygSelectionSnapshot {
  readonly cursor?: TextPosition
  readonly selection?: TextRange
  readonly bookmark?: IndexCursor
  readonly scrollTop: number
  readonly structuralAnchor: StructuralAnchor
}

export interface WysiwygEditorChange {
  readonly markdown: string
  readonly selection: WysiwygSelectionSnapshot
}

export interface WysiwygEditorOptions {
  readonly markdown: string
  readonly onChange: (change: WysiwygEditorChange) => void
  readonly onScrollAnchor?: (anchor: StructuralAnchor) => void
}

interface SyntheticBoundary {
  readonly beforeMarkdown: string
  readonly afterMarkdown: string
  readonly beforeCursor: IndexCursor | null
  readonly afterCursor: IndexCursor | null
  readonly nativeUndoDepth: number
  parkedNativeRedo: unknown[]
}

let pluginsRegistered = false
function registerPlugins(): void {
  if (pluginsRegistered) return
  pluginsRegistered = true
  Muya.use(InlineFormatToolbar)
  Muya.use(LinkTools)
  Muya.use(ImageEditTool)
  Muya.use(ImageResizeBar)
  Muya.use(ImageToolBar)
  Muya.use(CodeBlockLanguageSelector)
  Muya.use(ParagraphFrontButton)
  Muya.use(ParagraphFrontMenu)
  Muya.use(ParagraphQuickInsertMenu)
  Muya.use(TableColumnToolbar)
  Muya.use(TableDragBar)
  Muya.use(TableRowColumMenu)
  Muya.use(PreviewToolBar)
}

function normalizeRoundTrip(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n').replace(/\n?$/, '\n')
}

function indexPositionToText(markdown: string, position: { line: number; ch: number }): TextPosition {
  const offset = absoluteOffset(markdown, position)
  return { line: position.line, column: position.ch, offset }
}

function textPositionToIndex(position: TextPosition): { line: number; ch: number } {
  return { line: position.line, ch: position.column }
}

function resultCursor(markdown: string, anchor: number, head: number): IndexCursor {
  return { anchor: positionAt(markdown, anchor), focus: positionAt(markdown, head) }
}

export class WysiwygRoundTripUnsafeError extends Error {
  constructor() {
    super('Muya could not round-trip this Markdown losslessly. MarkHere kept canonical Markdown unchanged and requires Source mode for this document.')
    this.name = 'WysiwygRoundTripUnsafeError'
  }
}

/**
 * MarkHere-owned boundary around the published Muya 0.2.0 engine.
 *
 * Muya's block tree, DOM and history are editor implementation details. The
 * only state allowed to cross this boundary as document content is Markdown.
 * The compatibility layer supplies source-coordinate caret handoff and a
 * synthetic whole-document undo boundary without making Muya canonical.
 */
export class MuyaWysiwygEditorAdapter {
  readonly #onChange: WysiwygEditorOptions['onChange']
  readonly #onScrollAnchor?: WysiwygEditorOptions['onScrollAnchor']
  #muya: Muya
  #suppress = 0
  #applyingSynthetic = 0
  #scrollHandler: (() => void) | null = null
  #syntheticUndo: SyntheticBoundary[] = []
  #syntheticRedo: SyntheticBoundary[] = []

  constructor(target: HTMLElement, options: WysiwygEditorOptions) {
    registerPlugins()
    this.#onChange = options.onChange
    this.#onScrollAnchor = options.onScrollAnchor
    this.#muya = new Muya(target, {
      markdown: options.markdown,
      frontMatter: true,
      math: true,
      codeBlockLineNumbers: false,
      spellcheckEnabled: true,
      // Raw HTML remains preserved in canonical Markdown/Source mode, but a
      // WYSIWYG surface must not create executable HTML DOM from user input.
      disableHtml: true
    })
    this.#muya.init()

    // Unknown/unsupported syntax must never be silently normalized by merely
    // entering WYSIWYG. Fall back to Source if the released engine cannot
    // round-trip the canonical Markdown exactly (apart from line ending/final LF).
    if (normalizeRoundTrip(this.#muya.getMarkdown()) !== normalizeRoundTrip(options.markdown)) {
      this.#muya.destroy()
      throw new WysiwygRoundTripUnsafeError()
    }

    this.#muya.on('json-change', this.#handleChange)
    if (this.#onScrollAnchor) {
      const dom = this.#muya.domNode
      const handler = (): void => this.#onScrollAnchor?.(this.captureStructuralAnchor())
      dom.addEventListener('scroll', handler, { passive: true })
      this.#scrollHandler = () => dom.removeEventListener('scroll', handler)
    }
  }

  get markdown(): string { return this.#muya.getMarkdown() }

  /**
   * Muya 0.2.0 batches inline JSON operations in requestAnimationFrame. Waiting
   * for one frame before a transition/save drains a same-frame keystroke before
   * MarkHere snapshots canonical Markdown.
   */
  async flush(): Promise<WysiwygEditorChange> {
    await drainPendingMuyaFrame()
    return { markdown: this.#muya.getMarkdown(), selection: this.captureSelection() }
  }

  /** Authoritative reload/recovery/system replacement: discard editor history. */
  applyExternalRevision(markdown: string): void {
    if (markdown === this.#muya.getMarkdown()) return
    this.#suppress += 1
    try {
      this.#muya.setContent(markdown, false)
      this.#syntheticUndo = []
      this.#syntheticRedo = []
    } finally { this.#suppress -= 1 }
  }

  /**
   * Apply a Source-mode bulk edit above the existing WYSIWYG history. The
   * published Muya release clears history on setContent, so MarkHere suppresses
   * that clear and records a synthetic boundary at the current native depth.
   * Undo therefore removes later native edits first, then reverts the complete
   * Source handoff as one transaction, never to a stale WYSIWYG snapshot.
   */
  replaceCanonicalWithUndoBoundary(markdown: string): void {
    const before = this.#muya.getMarkdown()
    if (before === markdown) return
    this.#recordSyntheticReplacement(before, markdown, getIndexCursor(this.#muya), null)
  }

  captureSelection(): WysiwygSelectionSnapshot {
    const markdown = this.#muya.getMarkdown()
    const index = getIndexCursor(this.#muya)
    const anchor = index?.anchor ? indexPositionToText(markdown, index.anchor) : undefined
    const focus = index?.focus ? indexPositionToText(markdown, index.focus) : undefined
    return {
      ...(focus ? { cursor: focus } : {}),
      ...(anchor && focus ? { selection: { anchor, head: focus } } : {}),
      ...(index ? { bookmark: index } : {}),
      scrollTop: this.#muya.domNode.scrollTop,
      structuralAnchor: index?.focus
        ? { sourceLine: index.focus.line, ...(focus ? { sourceOffset: focus.offset } : {}), intraBlockRatio: 0 }
        : { sourceLine: 0, intraBlockRatio: 0 }
    }
  }

  restoreSelection(snapshot?: Partial<WysiwygSelectionSnapshot>): void {
    let index: IndexCursor | null = snapshot?.bookmark ?? null
    if (!index && snapshot?.selection) {
      index = {
        anchor: textPositionToIndex(snapshot.selection.anchor),
        focus: textPositionToIndex(snapshot.selection.head)
      }
    } else if (!index && snapshot?.cursor) {
      const point = textPositionToIndex(snapshot.cursor)
      index = { anchor: point, focus: point }
    }
    if (index) setIndexCursor(this.#muya, index)
    if (snapshot?.scrollTop !== undefined) this.#muya.domNode.scrollTop = snapshot.scrollTop
  }

  captureStructuralAnchor(): StructuralAnchor {
    const cursor = getIndexCursor(this.#muya)?.focus
    if (!cursor) return { sourceLine: 0, intraBlockRatio: 0 }
    return {
      sourceLine: cursor.line,
      sourceOffset: absoluteOffset(this.#muya.getMarkdown(), cursor),
      intraBlockRatio: 0
    }
  }

  scrollToStructuralAnchor(anchor: StructuralAnchor): void {
    if (anchor.sourceLine === undefined) return
    const point = { line: anchor.sourceLine, ch: 0 }
    setIndexCursor(this.#muya, { anchor: point, focus: point })
  }

  focus(): void { this.#muya.focus() }

  undo(): boolean {
    const boundary = this.#syntheticUndo.at(-1)
    if (boundary && nativeUndoDepth(this.#muya) <= boundary.nativeUndoDepth) {
      this.#syntheticUndo.pop()
      // Native edits undone immediately above the Source boundary belong to
      // the post-Source document. Park (rather than discard) their redo ops
      // while the document is temporarily back on the pre-Source side.
      boundary.parkedNativeRedo = takeNativeRedo(this.#muya)
      this.#applySynthetic(boundary, 'undo')
      this.#syntheticRedo.push(boundary)
      return true
    }
    if (!nativeCanUndo(this.#muya)) return false
    this.#muya.undo()
    return true
  }

  redo(): boolean {
    const boundary = this.#syntheticRedo.pop()
    if (boundary) {
      this.#applySynthetic(boundary, 'redo')
      restoreNativeRedo(this.#muya, boundary.parkedNativeRedo)
      boundary.parkedNativeRedo = []
      this.#syntheticUndo.push(boundary)
      return true
    }
    if (!nativeCanRedo(this.#muya)) return false
    this.#muya.redo()
    return true
  }

  search(query: string): void {
    this.#muya.search(query, { isRegexp: false, isCaseSensitive: false, isWholeWord: false, selectHighlight: true })
  }
  findNext(): void { this.#muya.find('next') }
  findPrevious(): void { this.#muya.find('previous') }
  replace(value: string, all = false): void {
    this.#muya.replace(value, { isSingle: !all, isRegexp: false })
  }

  execute(command: WysiwygEditorCommand): boolean {
    if (command === 'history.undo') return this.undo()
    if (command === 'history.redo') return this.redo()
    if (command === 'search.find' || command === 'search.replace') return true

    const before = this.#muya.getMarkdown()
    const cursor = getIndexCursor(this.#muya)
    if (!cursor?.anchor || !cursor.focus) return false
    const result = applyMarkdownCommand(
      before,
      { anchor: absoluteOffset(before, cursor.anchor), head: absoluteOffset(before, cursor.focus) },
      command
    )
    if (!result || result.markdown === before) return false
    this.#recordSyntheticReplacement(before, result.markdown, cursor, resultCursor(result.markdown, result.anchor, result.head))
    return true
  }

  destroy(): void {
    this.#scrollHandler?.()
    this.#scrollHandler = null
    this.#muya.off('json-change', this.#handleChange)
    this.#muya.destroy()
  }

  #recordSyntheticReplacement(before: string, after: string, beforeCursor: IndexCursor | null, afterCursor: IndexCursor | null): void {
    const boundary: SyntheticBoundary = {
      beforeMarkdown: before,
      afterMarkdown: after,
      beforeCursor,
      afterCursor,
      nativeUndoDepth: nativeUndoDepth(this.#muya),
      parkedNativeRedo: []
    }
    this.#applyingSynthetic += 1
    try {
      setContentPreservingHistory(this.#muya, after)
      if (afterCursor) setIndexCursor(this.#muya, afterCursor)
    } finally { this.#applyingSynthetic -= 1 }
    this.#syntheticUndo.push(boundary)
    this.#syntheticRedo = []
    this.#emitCurrent()
  }

  #applySynthetic(boundary: SyntheticBoundary, direction: 'undo' | 'redo'): void {
    const markdown = direction === 'undo' ? boundary.beforeMarkdown : boundary.afterMarkdown
    const cursor = direction === 'undo' ? boundary.beforeCursor : boundary.afterCursor
    this.#applyingSynthetic += 1
    try {
      setContentPreservingHistory(this.#muya, markdown)
      if (cursor) setIndexCursor(this.#muya, cursor)
    } finally { this.#applyingSynthetic -= 1 }
    this.#emitCurrent()
  }

  #emitCurrent(): void {
    if (this.#suppress > 0) return
    this.#onChange({ markdown: this.#muya.getMarkdown(), selection: this.captureSelection() })
  }

  #handleChange = (): void => {
    if (this.#suppress > 0 || this.#applyingSynthetic > 0) return
    // A new user edit after a synthetic undo creates a new history branch.
    if (this.#syntheticRedo.length > 0) this.#syntheticRedo = []
    this.#emitCurrent()
  }
}
