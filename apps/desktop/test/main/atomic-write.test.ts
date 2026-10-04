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

describe('Issue 10 atomic-save fault injection', () => {
  it('keeps the original when writing fails before temp creation completes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markhere-atomic-before-write-'))
    try {
      const target = join(dir, 'document.md')
      await writeFile(target, 'durable-original')
      await expect(atomicReplaceFile(target, Buffer.from('new'), { beforeWrite: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) } })).rejects.toThrow('disk full')
      expect(await readFile(target, 'utf8')).toBe('durable-original')
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('keeps the original when failure occurs after complete temp write but before replace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markhere-atomic-after-write-'))
    try {
      const target = join(dir, 'document.md')
      await writeFile(target, 'durable-original')
      await expect(atomicReplaceFile(target, Buffer.from('new-complete'), { afterWrite: async () => { throw new Error('simulated interruption') } })).rejects.toThrow('simulated interruption')
      expect(await readFile(target, 'utf8')).toBe('durable-original')
      expect((await readdir(dir)).filter((name) => name.endsWith('.markhere.tmp'))).toEqual([])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
