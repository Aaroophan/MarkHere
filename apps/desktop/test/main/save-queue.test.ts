import { describe, expect, it } from 'vitest'
import { PerDocumentSaveQueue } from '../../src/main/documents/save-queue'

describe('PerDocumentSaveQueue', () => {
  it('serializes saves for one document while preserving request order', async () => {
    const queue = new PerDocumentSaveQueue()
    const trace: string[] = []
    const first = queue.enqueue('doc', async () => { trace.push('start-1'); await new Promise((resolve) => setTimeout(resolve, 10)); trace.push('end-1'); return 1 })
    const second = queue.enqueue('doc', async () => { trace.push('start-2'); trace.push('end-2'); return 2 })
    expect(await Promise.all([first, second])).toEqual([1, 2])
    expect(trace).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })
})
