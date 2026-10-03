import { mkdir, readFile, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ExportTempStorage } from '../../src/main/export/export-temp-storage'

describe('export temporary storage', () => {
  it('keeps incomplete output isolated from the selected final target until commit', async () => {
    const root = join(tmpdir(), `markhere-export-test-${randomUUID()}`)
    const temp = new ExportTempStorage(root)
    await temp.initialize()
    const jobId = randomUUID()
    await temp.prepare(jobId)
    await temp.writeJobFile(jobId, 'result.tmp', new TextEncoder().encode('complete artifact'))
    const finalPath = join(root, 'selected-output.html')
    await expect(stat(finalPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await temp.commitFinal(finalPath, new TextEncoder().encode('complete artifact'))
    expect(await readFile(finalPath, 'utf8')).toBe('complete artifact')
    await temp.cleanup(jobId)
    await rm(root, { recursive: true, force: true })
  })

  it('removes stale crashed job directories on startup cleanup', async () => {
    const root = join(tmpdir(), `markhere-export-test-${randomUUID()}`)
    const exportRoot = join(root, 'MarkHere', 'exports')
    const stale = join(exportRoot, randomUUID())
    await mkdir(stale, { recursive: true })
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await utimes(stale, old, old)
    const temp = new ExportTempStorage(root)
    await temp.initialize()
    await expect(stat(stale)).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })
})
