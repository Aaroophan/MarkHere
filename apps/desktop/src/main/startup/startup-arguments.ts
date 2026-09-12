import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

export type StartupMode = 'preview' | 'wysiwyg' | 'source' | 'split'

export interface StartupPathRequest {
  readonly path: string
  readonly kind: 'file' | 'directory' | 'missing' | 'unknown'
}

export interface StartupRequest {
  readonly source: 'initial' | 'second-instance' | 'open-file' | 'open-url'
  readonly newWindow: boolean
  readonly mode?: StartupMode
  readonly paths: readonly StartupPathRequest[]
}

export interface ParsedStartupArguments {
  readonly newWindow: boolean
  readonly mode?: StartupMode
  readonly rawPaths: readonly string[]
}

const VALID_MODES = new Set<StartupMode>(['preview', 'wysiwyg', 'source', 'split'])

/**
 * Parse only MarkHere-owned CLI switches. Unknown switches are intentionally
 * ignored instead of being interpreted as shell syntax or reconstructed into
 * a command string.
 */
export function parseStartupArguments(argv: readonly string[]): ParsedStartupArguments {
  let newWindow = false
  let mode: StartupMode | undefined
  const rawPaths: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue

    if (arg === '--new-window') {
      newWindow = true
      continue
    }

    if (arg === '--mode') {
      const candidate = argv[index + 1]
      if (candidate && VALID_MODES.has(candidate as StartupMode)) {
        mode = candidate as StartupMode
        index += 1
      }
      continue
    }

    if (arg.startsWith('--mode=')) {
      const candidate = arg.slice('--mode='.length)
      if (VALID_MODES.has(candidate as StartupMode)) mode = candidate as StartupMode
      continue
    }

    if (arg.startsWith('-')) continue
    rawPaths.push(arg)
  }

  return {
    newWindow,
    ...(mode ? { mode } : {}),
    rawPaths
  }
}

export async function classifyStartupPaths(
  rawPaths: readonly string[],
  cwd: string
): Promise<StartupPathRequest[]> {
  const requests: StartupPathRequest[] = []

  for (const raw of rawPaths) {
    const fullPath = isAbsolute(raw) ? raw : resolve(cwd, raw)
    try {
      const info = await stat(fullPath)
      requests.push({
        path: fullPath,
        kind: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'unknown'
      })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      requests.push({ path: fullPath, kind: code === 'ENOENT' ? 'missing' : 'unknown' })
    }
  }

  return requests
}

export async function createStartupRequest(
  argv: readonly string[],
  source: StartupRequest['source'],
  cwd: string
): Promise<StartupRequest> {
  const parsed = parseStartupArguments(argv)
  return {
    source,
    newWindow: parsed.newWindow,
    ...(parsed.mode ? { mode: parsed.mode } : {}),
    paths: await classifyStartupPaths(parsed.rawPaths, cwd)
  }
}
