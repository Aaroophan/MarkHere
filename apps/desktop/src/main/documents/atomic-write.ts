import { randomUUID } from 'node:crypto'
import { chmod, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface AtomicWriteFaultInjector {
  readonly beforeWrite?: () => Promise<void>
  readonly afterWrite?: () => Promise<void>
  readonly beforeReplace?: () => Promise<void>
}

async function safeUnlink(path: string): Promise<void> {
  try { await unlink(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

export async function atomicReplaceFile(targetPath: string, bytes: Buffer, faults?: AtomicWriteFaultInjector): Promise<void> {
  const dir = dirname(targetPath)
  const tempPath = join(dir, `.${randomUUID()}.markhere.tmp`)
  let mode: number | undefined
  try {
    try { mode = (await stat(targetPath)).mode } catch { /* new file */ }
    await faults?.beforeWrite?.()
    await writeFile(tempPath, bytes, { flag: 'wx', flush: true, ...(mode ? { mode } : {}) })
    await faults?.afterWrite?.()
    if (mode) await chmod(tempPath, mode)
    await faults?.beforeReplace?.()
    try {
      await rename(tempPath, targetPath)
    } catch (error) {
      // Windows may reject rename-over-existing. Removing the old name creates a
      // short replacement gap but still guarantees we never partially overwrite it.
      if (process.platform !== 'win32' || !['EEXIST', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      const backupPath = join(dir, `.${randomUUID()}.markhere.bak`)
      await rename(targetPath, backupPath)
      try {
        await rename(tempPath, targetPath)
        await safeUnlink(backupPath)
      } catch (replaceError) {
        try { await rename(backupPath, targetPath) } catch { /* preserve primary failure */ }
        throw replaceError
      }
    }
  } finally {
    await safeUnlink(tempPath)
  }
}
