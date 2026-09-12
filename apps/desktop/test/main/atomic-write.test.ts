import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicReplaceFile } from '../../src/main/documents/atomic-write'

describe('atomicReplaceFile', () => {
  it('replaces complete content and cleans temporary files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markhere-atomic-'))
    try {
      const target = join(dir, 'document.md')
      await writeFile(target, 'old')
      await atomicReplaceFile(target, Buffer.from('new complete content'))
      expect(await readFile(target, 'utf8')).toBe('new complete content')
      expect((await readdir(dir)).filter((name) => name.endsWith('.markhere.tmp'))).toEqual([])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('leaves the original untouched when failure occurs before replace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markhere-atomic-fault-'))
    try {
      const target = join(dir, 'document.md')
      await writeFile(target, 'known-good')
      await expect(atomicReplaceFile(target, Buffer.from('partial?'), {
        beforeReplace: async () => { throw new Error('injected failure') }
      })).rejects.toThrow('injected failure')
      expect(await readFile(target, 'utf8')).toBe('known-good')
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
