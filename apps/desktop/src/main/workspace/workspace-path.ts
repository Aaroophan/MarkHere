import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from 'node:path'

function comparable(path: string): string {
  const normalized = normalize(path).normalize('NFC')
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

export function validateWorkspaceRelativePath(input = ''): string {
  if (input.includes('\0')) throw new Error('Workspace paths cannot contain NUL.')
  const raw = input.replace(/\\/g, '/')
  if (!raw || raw === '.') return ''
  if (isAbsolute(input) || /^[/\\]{2}/u.test(input) || /^[A-Za-z]:/u.test(input) || /^\\[?.]\\/u.test(input)) {
    throw new Error('Workspace paths must be relative.')
  }
  const parts = raw.split('/').filter((part) => part.length > 0 && part !== '.')
  if (parts.some((part) => part === '..')) throw new Error('Workspace path traversal is not allowed.')
  return parts.join('/')
}

export function validateWorkspaceBasename(input: string): string {
  const name = input.trim()
  if (!name || name === '.' || name === '..' || name !== basename(name) || /[\\/\0]/u.test(name)) {
    throw new Error('Workspace entry name is invalid.')
  }
  if (process.platform === 'win32' && /[<>:"|?*]/u.test(name)) throw new Error('Workspace entry name is invalid on Windows.')
  return name
}

export function isWithinWorkspace(rootCanonicalPath: string, candidateCanonicalPath: string): boolean {
  const root = comparable(rootCanonicalPath)
  const candidate = comparable(candidateCanonicalPath)
  if (candidate === root) return true
  return candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)
}

export async function resolveExistingWorkspacePath(rootCanonicalPath: string, relativePath = ''): Promise<string> {
  const safeRelative = validateWorkspaceRelativePath(relativePath)
  const candidate = resolve(rootCanonicalPath, safeRelative)
  const canonical = normalize(await realpath(candidate))
  if (!isWithinWorkspace(rootCanonicalPath, canonical)) throw new Error('Workspace path escapes the authorized root.')
  return canonical
}

export async function resolveWorkspaceTarget(rootCanonicalPath: string, relativePath: string): Promise<string> {
  const safeRelative = validateWorkspaceRelativePath(relativePath)
  if (!safeRelative) throw new Error('The workspace root cannot be mutated.')
  const candidate = normalize(resolve(rootCanonicalPath, safeRelative))
  if (!isWithinWorkspace(rootCanonicalPath, candidate)) throw new Error('Workspace path escapes the authorized root.')
  const parentCanonical = normalize(await realpath(dirname(candidate)))
  if (!isWithinWorkspace(rootCanonicalPath, parentCanonical)) throw new Error('Workspace target parent escapes the authorized root.')
  return resolve(parentCanonical, basename(candidate))
}

export async function assertWorkspaceDirectory(path: string): Promise<void> {
  const info = await stat(path)
  if (!info.isDirectory()) throw new Error('Workspace target is not a directory.')
}

export function workspaceRelativePath(rootCanonicalPath: string, absolutePath: string): string {
  const output = relative(rootCanonicalPath, absolutePath).replace(/\\/g, '/')
  return output === '.' ? '' : output
}
