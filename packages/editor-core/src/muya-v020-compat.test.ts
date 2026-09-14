import { describe, expect, it } from 'vitest'
import type { Muya } from '@muyajs/core'
import {
  getIndexCursor,
  nativeUndoDepth,
  restoreNativeRedo,
  setIndexCursor,
  takeNativeRedo
} from './muya-v020-compat'

describe('Muya 0.2 compatibility boundary', () => {
  it('maps a WYSIWYG selection without leaving sentinel text in Muya JSON state', () => {
    let state: Array<Record<string, unknown>> = [{ name: 'paragraph', text: 'hello' }]
    const muya = {
      editor: {
        selection: {
          getSelection: () => ({
            anchor: { offset: 2 },
            focus: { offset: 2 },
            anchorPath: [0, 'text'],
            focusPath: [0, 'text']
          })
        },
        jsonState: {
          getState: () => structuredClone(state),
          setState: (next: Array<Record<string, unknown>>) => { state = next },
          getMarkdown: () => String(state[0]?.text ?? '')
        }
      }
    } as unknown as Muya

    expect(getIndexCursor(muya)).toEqual({
      anchor: { line: 0, ch: 2 },
      focus: { line: 0, ch: 2 }
    })
    expect(state).toEqual([{ name: 'paragraph', text: 'hello' }])
  })


  it('restores clean Markdown when cursor resolution throws after loading sentinels', () => {
    let markdown = 'hello'
    const history = {
      clear: () => undefined,
      cutoff: () => undefined,
      _stack: { undo: [], redo: [] }
    }
    const muya = {
      getMarkdown: () => markdown,
      setContent: (next: string) => { markdown = next },
      editor: {
        history,
        scrollPage: {
          depthFirstTraverse: () => { throw new Error('fault injection') },
          queryBlock: () => null
        },
        selection: { setSelection: () => undefined }
      }
    } as unknown as Muya

    expect(() => setIndexCursor(muya, {
      anchor: { line: 0, ch: 2 },
      focus: { line: 0, ch: 2 }
    })).toThrow('fault injection')
    expect(markdown).toBe('hello')
  })

  it('parks and restores native redo entries across a synthetic Source boundary', () => {
    const history = {
      _stack: {
        undo: [{ id: 'older-1' }, { id: 'older-2' }],
        redo: [{ id: 'newer-1' }, { id: 'newer-2' }]
      },
      clear: () => undefined,
      cutoff: () => undefined,
      canUndo: () => true,
      canRedo: () => true
    }
    const muya = { editor: { history } } as unknown as Muya

    expect(nativeUndoDepth(muya)).toBe(2)
    const parked = takeNativeRedo(muya)
    expect(parked).toEqual([{ id: 'newer-1' }, { id: 'newer-2' }])
    expect(history._stack.redo).toEqual([])

    restoreNativeRedo(muya, parked)
    expect(history._stack.redo).toEqual([{ id: 'newer-1' }, { id: 'newer-2' }])
  })
})
