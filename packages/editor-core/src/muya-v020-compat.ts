/**
 * @markhere-upstream
 * Adapted from MarkText's Muya source-coordinate cursor bridge.
 * Upstream: marktext/marktext packages/muya/src/selection/offsetCursor.ts
 * Revision: 4e354c0c69e1ca4925fc2d8f0126c63ff6d43d46
 * License: MIT, Copyright (c) 2018-present Luo Ran
 *
 * MarkHere carries this small adapter because the installable @muyajs/core
 * 0.2.0 release predates the cursor-offset API that MarkText later added in
 * its monorepo. The canonical document remains Markdown; this code only maps
 * Muya's block selection to/from source line/column coordinates.
 */
import type { Muya, TState } from '@muyajs/core'

export interface IndexPosition {
  readonly line: number
  readonly ch: number
}

export interface IndexCursor {
  readonly anchor: IndexPosition | null
  readonly focus: IndexPosition | null
}

type ScrollPageLike = NonNullable<Muya['editor']['scrollPage']>

interface ContentBlockLike {
  readonly path: ReadonlyArray<string | number>
  readonly text: string
  isContent(): boolean
  setCursor(start: number, end: number, force?: boolean): void
}

interface HistoryCompat {
  clear: () => void
  cutoff?: () => void
  canUndo?: () => boolean
  canRedo?: () => boolean
  _stack?: {
    undo?: unknown[]
    redo?: unknown[]
  }
}

interface MuyaSelectionLike {
  readonly anchor: { readonly offset: number }
  readonly focus: { readonly offset: number }
  readonly anchorPath: ReadonlyArray<string | number>
  readonly focusPath: ReadonlyArray<string | number>
}

interface SentinelHit {
  readonly block: ContentBlockLike
  readonly offset: number
}

const ANCHOR_SENTINEL = 'mHcUrSoRzZqAnChOr9x7kPvWb'
const FOCUS_SENTINEL = 'mHcUrSoRzZqFoCuS4t2nDhGj'

function clampOffset(value: number, length: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), length) : 0
}

function injectSentinels(markdown: string, cursor: IndexCursor): string | null {
  const { anchor, focus } = cursor
  if (!anchor || !focus) return null
  const lines = markdown.split('\n')
  const validLine = (line: number): boolean => Number.isInteger(line) && line >= 0 && line < lines.length
  if (!validLine(anchor.line) || !validLine(focus.line)) return null

  const anchorText = lines[anchor.line]!
  const focusText = lines[focus.line]!
  const anchorCh = clampOffset(anchor.ch, anchorText.length)
  const focusCh = clampOffset(focus.ch, focusText.length)

  if (anchor.line === focus.line) {
    const min = Math.min(anchorCh, focusCh)
    const max = Math.max(anchorCh, focusCh)
    const firstSentinel = anchorCh <= focusCh ? ANCHOR_SENTINEL : FOCUS_SENTINEL
    const secondSentinel = anchorCh <= focusCh ? FOCUS_SENTINEL : ANCHOR_SENTINEL
    lines[anchor.line] = anchorText.slice(0, min) + firstSentinel + anchorText.slice(min, max) + secondSentinel + anchorText.slice(max)
  } else {
    lines[anchor.line] = anchorText.slice(0, anchorCh) + ANCHOR_SENTINEL + anchorText.slice(anchorCh)
    lines[focus.line] = focusText.slice(0, focusCh) + FOCUS_SENTINEL + focusText.slice(focusCh)
  }
  return lines.join('\n')
}

function findSentinel(scrollPage: ScrollPageLike, sentinel: string): SentinelHit | null {
  let hit: SentinelHit | null = null
  scrollPage.depthFirstTraverse((node) => {
    const content = node as unknown as ContentBlockLike
    if (hit || !content.isContent()) return
    const index = content.text.indexOf(sentinel)
    if (index >= 0) hit = { block: content, offset: index }
  })
  return hit
}

function resolveSentinelCursor(scrollPage: ScrollPageLike): {
  anchor: { offset: number }
  focus: { offset: number }
  anchorPath: Array<string | number>
  focusPath: Array<string | number>
} | null {
  const anchorHit = findSentinel(scrollPage, ANCHOR_SENTINEL)
  const focusHit = findSentinel(scrollPage, FOCUS_SENTINEL)
  if (!anchorHit && !focusHit) return null

  const anchor = anchorHit ?? focusHit!
  const focus = focusHit ?? anchorHit!
  let anchorOffset = anchor.offset
  let focusOffset = focus.offset
  if (anchor.block === focus.block) {
    if (anchorOffset <= focusOffset) focusOffset = Math.max(focusOffset - ANCHOR_SENTINEL.length, anchorOffset)
    else anchorOffset = Math.max(anchorOffset - FOCUS_SENTINEL.length, focusOffset)
  }
  return {
    anchor: { offset: anchorOffset },
    focus: { offset: focusOffset },
    anchorPath: [...anchor.block.path],
    focusPath: [...focus.block.path]
  }
}

function injectAtPath(state: TState[], path: ReadonlyArray<string | number>, offset: number, sentinel: string): boolean {
  if (path.length === 0) return false
  let node: unknown = state
  for (let index = 0; index < path.length - 1; index += 1) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string | number, unknown>)[path[index]!]
  }
  if (node === null || typeof node !== 'object') return false
  const key = path[path.length - 1]!
  const holder = node as Record<string | number, unknown>
  const text = holder[key]
  if (typeof text !== 'string') return false
  const at = clampOffset(offset, text.length)
  holder[key] = text.slice(0, at) + sentinel + text.slice(at)
  return true
}

function injectStateSentinels(state: TState[], selection: MuyaSelectionLike): TState[] | null {
  const anchorPath = selection.anchorPath
  const focusPath = selection.focusPath
  const anchorOffset = selection.anchor.offset
  const focusOffset = selection.focus.offset
  const sameBlock = anchorPath.length === focusPath.length && anchorPath.every((part, index) => part === focusPath[index])

  if (!sameBlock) {
    const anchorOk = injectAtPath(state, anchorPath, anchorOffset, ANCHOR_SENTINEL)
    const focusOk = injectAtPath(state, focusPath, focusOffset, FOCUS_SENTINEL)
    return anchorOk || focusOk ? state : null
  }

  let ok = false
  if (anchorOffset <= focusOffset) {
    ok = injectAtPath(state, anchorPath, anchorOffset, ANCHOR_SENTINEL)
    ok = injectAtPath(state, focusPath, focusOffset + ANCHOR_SENTINEL.length, FOCUS_SENTINEL) || ok
  } else {
    ok = injectAtPath(state, focusPath, focusOffset, FOCUS_SENTINEL)
    ok = injectAtPath(state, anchorPath, anchorOffset + FOCUS_SENTINEL.length, ANCHOR_SENTINEL) || ok
  }
  return ok ? state : null
}

function lineColumnAt(markdown: string, index: number): IndexPosition {
  let line = 0
  for (let cursor = 0; cursor < index; cursor += 1) if (markdown.charCodeAt(cursor) === 10) line += 1
  const previousNewline = markdown.lastIndexOf('\n', index - 1)
  return { line, ch: index - (previousNewline + 1) }
}

function cleanSentinelPosition(markdown: string, own: string, other: string): IndexPosition | null {
  const ownIndex = markdown.indexOf(own)
  if (ownIndex < 0) return null
  const raw = lineColumnAt(markdown, ownIndex)
  const otherIndex = markdown.indexOf(other)
  if (otherIndex >= 0 && otherIndex < ownIndex && lineColumnAt(markdown, otherIndex).line === raw.line) {
    return { line: raw.line, ch: raw.ch - other.length }
  }
  return raw
}

function locateSentinelOffsets(markdown: string): IndexCursor | null {
  const anchor = cleanSentinelPosition(markdown, ANCHOR_SENTINEL, FOCUS_SENTINEL)
  const focus = cleanSentinelPosition(markdown, FOCUS_SENTINEL, ANCHOR_SENTINEL)
  if (!anchor && !focus) return null
  return { anchor: anchor ?? focus, focus: focus ?? anchor }
}

/** Read Muya's live WYSIWYG selection as source `{line,ch}` coordinates. */
export function getIndexCursor(muya: Muya): IndexCursor | null {
  const selection = muya.editor.selection.getSelection() as MuyaSelectionLike | null
  if (!selection) return null
  const originalState = muya.editor.jsonState.getState()
  // Keep the clean backup immutable: sentinel injection is intentionally
  // destructive, so it must operate on a second throwaway clone.
  const scratchState = structuredClone(originalState)
  const state = injectStateSentinels(scratchState, selection)
  if (!state) return null

  // JSONState's state serializer is already the exact serializer the editor
  // uses. Swap only its private model clone long enough to serialize the
  // sentinel-bearing throwaway state; the live block tree/DOM is untouched.
  muya.editor.jsonState.setState(state)
  try { return locateSentinelOffsets(muya.editor.jsonState.getMarkdown()) }
  finally { muya.editor.jsonState.setState(originalState) }
}

function withHistoryClearSuppressed<T>(muya: Muya, operation: () => T): T {
  const history = muya.editor.history as unknown as HistoryCompat
  const originalClear = history.clear
  history.clear = () => undefined
  try { return operation() }
  finally {
    history.clear = originalClear
    history.cutoff?.()
  }
}

/** Restore a source cursor without clearing Muya's existing undo stack. */
export function setIndexCursor(muya: Muya, cursor: IndexCursor): boolean {
  const cleanMarkdown = muya.getMarkdown()
  const sentinelMarkdown = injectSentinels(cleanMarkdown, cursor)
  if (sentinelMarkdown === null) return false

  const resolved = withHistoryClearSuppressed(muya, () => {
    muya.setContent(sentinelMarkdown, false)
    try {
      const sentinelPage = muya.editor.scrollPage
      return sentinelPage ? resolveSentinelCursor(sentinelPage) : null
    } finally {
      // Cursor restoration is allowed to fail, but the transient sentinel
      // document is never allowed to survive the attempt.
      muya.setContent(cleanMarkdown, false)
    }
  })
  if (!resolved || !muya.editor.scrollPage) return false

  const anchorBlock = muya.editor.scrollPage.queryBlock([...resolved.anchorPath]) as unknown as ContentBlockLike | null
  const focusBlock = muya.editor.scrollPage.queryBlock([...resolved.focusPath]) as unknown as ContentBlockLike | null
  if (!anchorBlock?.isContent?.()) return false
  if (!focusBlock || anchorBlock === focusBlock) {
    anchorBlock.setCursor(
      Math.min(resolved.anchor.offset, resolved.focus.offset),
      Math.max(resolved.anchor.offset, resolved.focus.offset),
      true
    )
    return true
  }
  if (!focusBlock.isContent?.()) return false
  muya.editor.selection.setSelection({
    anchor: resolved.anchor,
    focus: resolved.focus,
    anchorBlock,
    anchorPath: anchorBlock.path,
    focusBlock,
    focusPath: focusBlock.path
  })
  return true
}

/** Replace Muya content without discarding its pre-existing native history. */
export function setContentPreservingHistory(muya: Muya, markdown: string): void {
  withHistoryClearSuppressed(muya, () => muya.setContent(markdown, false))
}

export function nativeUndoDepth(muya: Muya): number {
  const stack = (muya.editor.history as unknown as HistoryCompat)._stack?.undo
  return Array.isArray(stack) ? stack.length : 0
}

export function nativeCanUndo(muya: Muya): boolean {
  return Boolean((muya.editor.history as unknown as HistoryCompat).canUndo?.())
}

export function nativeCanRedo(muya: Muya): boolean {
  return Boolean((muya.editor.history as unknown as HistoryCompat).canRedo?.())
}

export function takeNativeRedo(muya: Muya): unknown[] {
  const history = muya.editor.history as unknown as HistoryCompat
  const redo = history._stack?.redo
  if (!Array.isArray(redo) || redo.length === 0) return []
  const parked = [...redo]
  redo.length = 0
  return parked
}

export function restoreNativeRedo(muya: Muya, parked: ReadonlyArray<unknown>): void {
  if (parked.length === 0) return
  const history = muya.editor.history as unknown as HistoryCompat
  const redo = history._stack?.redo
  if (!Array.isArray(redo)) return
  redo.splice(0, redo.length, ...parked)
}

export function absoluteOffset(markdown: string, position: IndexPosition): number {
  const lines = markdown.split('\n')
  const line = Math.min(Math.max(0, position.line), Math.max(0, lines.length - 1))
  let offset = 0
  for (let index = 0; index < line; index += 1) offset += lines[index]!.length + 1
  return offset + Math.min(Math.max(0, position.ch), lines[line]?.length ?? 0)
}

export function positionAt(markdown: string, offset: number): IndexPosition {
  const at = clampOffset(offset, markdown.length)
  return lineColumnAt(markdown, at)
}

/** Drain Muya 0.2.0's requestAnimationFrame-batched JSON operation cache. */
export function drainPendingMuyaFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
