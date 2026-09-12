import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { FileFingerprint } from '@markhere/ipc-contract'

export async function fingerprintFile(path: string, strong = false): Promise<FileFingerprint> {
  const info = await stat(path)
  const base: FileFingerprint = {
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
    platformFileId: `${info.dev}:${info.ino}`
  }
  if (!strong) return base
  const bytes = await readFile(path)
  return { ...base, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export function fastFingerprintEqual(a: FileFingerprint | null, b: FileFingerprint | null): boolean {
  return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs
}

export async function fingerprintMatchesExpected(path: string, expected: FileFingerprint | null): Promise<{ matches: boolean; actual: FileFingerprint | null }> {
  if (!expected) return { matches: true, actual: null }
  let actual: FileFingerprint
  try {
    actual = await fingerprintFile(path, false)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { matches: false, actual: null }
    throw error
  }
  if (fastFingerprintEqual(expected, actual)) return { matches: true, actual }
  const actualStrong = await fingerprintFile(path, true)
  if (expected.sha256) return { matches: expected.sha256 === actualStrong.sha256, actual: actualStrong }
  return { matches: false, actual: actualStrong }
}
