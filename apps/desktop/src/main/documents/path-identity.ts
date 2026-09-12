import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve } from 'node:path'

export interface PathIdentity {
  readonly displayPath: string
  readonly normalizedPath: string
  readonly canonicalPath: string
  readonly platformFileId?: string
}

function windowsComparable(path: string): string {
  return path.replace(/\\/g, '/').normalize('NFC').toLocaleLowerCase('en-US')
}

export async function identifyExistingPath(input: string): Promise<PathIdentity> {
  if (!input || !isAbsolute(input)) throw new Error('A trusted filesystem path must be absolute.')
  const normalizedPath = normalize(resolve(input))
  const canonicalPath = normalize(await realpath(normalizedPath))
  const info = await stat(canonicalPath)
  const platformFileId = `${String(info.dev)}:${String(info.ino)}`
  return { displayPath: input, normalizedPath, canonicalPath, platformFileId }
}

export function normalizeTargetPath(input: string): string {
  if (!input || !isAbsolute(input)) throw new Error('A trusted filesystem path must be absolute.')
  return normalize(resolve(input))
}

export function sameKnownPath(a: PathIdentity, b: PathIdentity): boolean {
  if (a.platformFileId && b.platformFileId && a.platformFileId === b.platformFileId) return true
  if (process.platform === 'win32') return windowsComparable(a.canonicalPath) === windowsComparable(b.canonicalPath)
  return a.canonicalPath.normalize('NFC') === b.canonicalPath.normalize('NFC')
}
