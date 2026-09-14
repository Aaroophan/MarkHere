import { describe, expect, it } from 'vitest'
import type { DocumentMode } from '@markhere/document-model'
import { ALL_MODE_TRANSITIONS, ModeController, applyMarkdownCommand, editableSurfaceForMode } from './index'

const modes: DocumentMode[] = ['preview', 'wysiwyg', 'source', 'split']

describe('Issue 5 mode transition matrix', () => {
  it('contains every directional transition exactly once', () => {
    expect(ALL_MODE_TRANSITIONS).toHaveLength(12)
    for (const from of modes) for (const to of modes) {
      if (from === to) continue
      expect(ALL_MODE_TRANSITIONS.filter(([a, b]) => a === from && b === to)).toHaveLength(1)
    }
  })

  for (const [from, to] of ALL_MODE_TRANSITIONS) {
    it(`${from} -> ${to} flushes outgoing editable state before activation`, async () => {
      let markdown = '# before\n'
      let revision = 4
      const calls: string[] = []
      const controller = new ModeController(from, {
        getCanonicalSnapshot: () => ({ markdown, revision }),
        flush: (surface) => {
          calls.push(`flush:${surface}`)
          const changed = surface === editableSurfaceForMode(from)
          return { markdown: changed ? '# after\n' : markdown, changed, structuralAnchor: { sourceLine: 3 }, selection: { cursor: true } }
        },
        commitFlushedMarkdown: (_surface, result) => {
          calls.push('commit')
          markdown = result.markdown
          revision += 1
          return { markdown, revision }
        },
        capture: () => ({ structuralAnchor: { sourceLine: 3 } }),
        deactivate: (surface) => { calls.push(`deactivate:${surface}`) },
        activate: (mode, snapshot) => { calls.push(`activate:${mode}:${snapshot.revision}`) },
        setMode: (mode) => { calls.push(`mode:${mode}`) }
      })
      await controller.transition(to)
      const outgoing = editableSurfaceForMode(from)
      if (outgoing) expect(calls[0]).toBe(`flush:${outgoing}`)
      expect(calls.find((call) => call.startsWith(`activate:${to}:`))).toBeTruthy()
      expect(controller.mode).toBe(to)
    })
  }

  it('same-frame pending Markdown returned by flush becomes canonical before transition', async () => {
    let markdown = 'a'
    let revision = 1
    const activated: string[] = []
    const controller = new ModeController('wysiwyg', {
      getCanonicalSnapshot: () => ({ markdown, revision }),
      flush: () => ({ markdown: 'ab', changed: true }),
      commitFlushedMarkdown: (_surface, result) => { markdown = result.markdown; revision += 1; return { markdown, revision } },
      capture: () => ({}), deactivate: () => undefined,
      activate: (_mode, snapshot) => { activated.push(snapshot.markdown) },
      setMode: () => undefined
    })
    await controller.transition('source')
    expect(markdown).toBe('ab')
    expect(activated.at(-1)).toBe('ab')
  })

  it('carries selection, scroll and structural navigation through a mode handoff', async () => {
    const received: unknown[] = []
    const controller = new ModeController('source', {
      getCanonicalSnapshot: () => ({ markdown: '# doc\n', revision: 7 }),
      flush: () => ({
        markdown: '# doc\n',
        changed: false,
        selection: { anchor: 4, head: 4 },
        scrollTop: 321,
        structuralAnchor: { sourceLine: 18, sourceOffset: 720, intraBlockRatio: 0.4 }
      }),
      commitFlushedMarkdown: () => ({ markdown: '# doc\n', revision: 7 }),
      capture: () => ({}),
      deactivate: () => undefined,
      activate: (_mode, _snapshot, navigation) => { received.push(navigation) },
      setMode: () => undefined
    })
    await controller.transition('preview')
    expect(received).toEqual([{
      selection: { anchor: 4, head: 4 },
      scrollTop: 321,
      structuralAnchor: { sourceLine: 18, sourceOffset: 720, intraBlockRatio: 0.4 },
      markdown: '# doc\n',
      changed: false
    }])
  })

  it('reuses the Source editable surface when switching Source <-> Split', async () => {
    const deactivated: string[] = []
    let mode: DocumentMode = 'source'
    const controller = new ModeController('source', {
      getCanonicalSnapshot: () => ({ markdown: 'same', revision: 2 }),
      flush: () => ({ markdown: 'same', changed: false }),
      commitFlushedMarkdown: () => ({ markdown: 'same', revision: 2 }),
      capture: () => ({}),
      deactivate: (surface) => { deactivated.push(surface) },
      activate: (next) => { mode = next },
      setMode: () => undefined
    })
    await controller.transition('split')
    await controller.transition('source')
    expect(mode).toBe('source')
    expect(deactivated).toEqual([])
  })

  it('flushActiveEditable commits a dirty editor before a persistence caller can read canonical state', async () => {
    let markdown = 'old'
    let revision = 12
    const controller = new ModeController('source', {
      getCanonicalSnapshot: () => ({ markdown, revision }),
      flush: () => ({ markdown: 'new', changed: true }),
      commitFlushedMarkdown: (_surface, result) => {
        markdown = result.markdown
        revision += 1
        return { markdown, revision }
      },
      capture: () => ({}), deactivate: () => undefined, activate: () => undefined, setMode: () => undefined
    })
    await expect(controller.flushActiveEditable()).resolves.toEqual({ markdown: 'new', revision: 13 })
  })

  it('serializes rapid mode transitions instead of interleaving activations', async () => {
    const activations: DocumentMode[] = []
    const controller = new ModeController('preview', {
      getCanonicalSnapshot: () => ({ markdown: 'x', revision: 1 }),
      flush: () => ({ markdown: 'x', changed: false }),
      commitFlushedMarkdown: () => ({ markdown: 'x', revision: 1 }),
      capture: () => ({}), deactivate: () => undefined,
      activate: async (mode) => {
        await Promise.resolve()
        activations.push(mode)
      },
      setMode: () => undefined
    })
    await Promise.all([controller.transition('source'), controller.transition('split'), controller.transition('preview')])
    expect(activations).toEqual(['source', 'split', 'preview'])
    expect(controller.mode).toBe('preview')
  })

  it('large, opaque and malformed Markdown are passed as canonical text without reinterpretation', async () => {
    const payloads = ['x'.repeat(1_000_000), ':::unknown\nvalue\n:::', '```mermaid\nnot valid {{{\n```']
    for (const markdown of payloads) {
      const seen: string[] = []
      const controller = new ModeController('preview', {
        getCanonicalSnapshot: () => ({ markdown, revision: 8 }),
        flush: () => ({ markdown, changed: false }), commitFlushedMarkdown: () => ({ markdown, revision: 8 }),
        capture: () => ({}), deactivate: () => undefined,
        activate: (_mode, snapshot) => { seen.push(snapshot.markdown) }, setMode: () => undefined
      })
      await controller.transition('source')
      expect(seen).toEqual([markdown])
    }
  })

  it('falls back to Source without changing canonical Markdown when target activation fails', async () => {
    const canonical = '# safe\n'
    const activations: DocumentMode[] = []
    const controller = new ModeController('preview', {
      getCanonicalSnapshot: () => ({ markdown: canonical, revision: 2 }),
      flush: () => ({ markdown: canonical, changed: false }), commitFlushedMarkdown: () => ({ markdown: canonical, revision: 2 }),
      capture: () => ({}), deactivate: () => undefined,
      activate: (mode) => { activations.push(mode); if (mode === 'wysiwyg') throw new Error('unsafe round-trip') },
      setMode: () => undefined
    })
    await expect(controller.transition('wysiwyg')).rejects.toThrow()
    expect(controller.mode).toBe('source')
    expect(activations).toEqual(['wysiwyg', 'source'])
  })
})


describe('shared Markdown editor commands', () => {
  it('uses one Markdown-native formatting vocabulary for Source and WYSIWYG adapters', () => {
    expect(applyMarkdownCommand('hello', { anchor: 0, head: 5 }, 'format.bold')).toEqual({
      markdown: '**hello**', anchor: 2, head: 7
    })
    expect(applyMarkdownCommand('alpha\nbeta', { anchor: 0, head: 10 }, 'paragraph.heading2')?.markdown)
      .toBe('## alpha\n## beta')
    expect(applyMarkdownCommand('- one\n- two', { anchor: 0, head: 11 }, 'paragraph.orderedList')?.markdown)
      .toBe('1. one\n2. two')
  })

  it('preserves backward selection direction after formatting', () => {
    const result = applyMarkdownCommand('hello', { anchor: 5, head: 0 }, 'format.italic')
    expect(result).toEqual({ markdown: '_hello_', anchor: 6, head: 1 })
  })
})
