import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { sanitizeMetadata, type LogContext, type LogEvent, type LogLevel, type LogProcess } from '@markhere/logging-core'
import { getApplicationStoragePaths } from '../storage/application-storage-paths'

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
const MAX_LOG_FILES = 5

function releaseChannel(version: string): string {
  if (version.includes('alpha')) return 'alpha'
  if (version.includes('beta')) return 'beta'
  return process.env.NODE_ENV === 'production' ? 'stable' : 'dev'
}

export class LocalLogger {
  readonly #process: LogProcess
  readonly #logDirectory: string
  readonly #logFile: string
  readonly #version: string
  readonly #channel: string
  #queue = Promise.resolve()

  constructor(processName: LogProcess = 'main') {
    this.#process = processName
    this.#logDirectory = getApplicationStoragePaths().logs
    this.#logFile = join(this.#logDirectory, 'markhere.log')
    this.#version = app.getVersion()
    this.#channel = releaseChannel(this.#version)
  }

  get directory(): string { return this.#logDirectory }
  get file(): string { return this.#logFile }

  trace(event: string, context?: LogContext): void { this.write('trace', event, context) }
  debug(event: string, context?: LogContext): void { this.write('debug', event, context) }
  info(event: string, context?: LogContext): void { this.write('info', event, context) }
  warn(event: string, context?: LogContext): void { this.write('warn', event, context) }
  error(event: string, context?: LogContext): void { this.write('error', event, context) }
  fatal(event: string, context?: LogContext): void { this.write('fatal', event, context) }

  write(level: LogLevel, event: string, context: LogContext = {}): void {
    const metadata = sanitizeMetadata(context.metadata)
    const record: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      event: event.slice(0, 160),
      process: this.#process,
      appVersion: this.#version,
      buildChannel: this.#channel,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      ...(context.windowId ? { windowId: context.windowId } : {}),
      ...(context.documentId ? { documentId: context.documentId } : {}),
      ...(context.jobId ? { jobId: context.jobId } : {}),
      ...(context.durationMs !== undefined ? { durationMs: context.durationMs } : {}),
      ...(context.result ? { result: context.result } : {}),
      ...(context.errorCode ? { errorCode: context.errorCode } : {}),
      ...(metadata ? { metadata } : {})
    }
    const line = `${JSON.stringify(record)}\n`
    this.#queue = this.#queue.then(async () => {
      await mkdir(this.#logDirectory, { recursive: true, mode: 0o700 })
      await this.#rotateIfNeeded(Buffer.byteLength(line))
      await appendFile(this.#logFile, line, { encoding: 'utf8', mode: 0o600 })
    }).catch(() => undefined)
  }

  async flush(): Promise<void> { await this.#queue }

  async clear(): Promise<void> {
    await this.flush()
    await rm(this.#logDirectory, { recursive: true, force: true })
    await mkdir(this.#logDirectory, { recursive: true, mode: 0o700 })
  }

  async readRedactedLogs(maxBytes = 2 * 1024 * 1024): Promise<readonly { name: string; content: string }[]> {
    await this.flush()
    await mkdir(this.#logDirectory, { recursive: true, mode: 0o700 })
    const names = (await readdir(this.#logDirectory)).filter((name) => /^markhere\.log(?:\.\d+)?$/u.test(name)).sort()
    const output: Array<{ name: string; content: string }> = []
    let remaining = maxBytes
    for (const name of names) {
      if (remaining <= 0) break
      const bytes = await readFile(join(this.#logDirectory, name))
      const slice = bytes.subarray(Math.max(0, bytes.length - remaining))
      output.push({ name, content: slice.toString('utf8') })
      remaining -= slice.length
    }
    return output
  }

  async #rotateIfNeeded(incomingBytes: number): Promise<void> {
    let currentSize = 0
    try { currentSize = (await stat(this.#logFile)).size } catch { /* new log */ }
    if (currentSize + incomingBytes <= MAX_LOG_FILE_BYTES) return
    await rm(`${this.#logFile}.${MAX_LOG_FILES - 1}`, { force: true })
    for (let index = MAX_LOG_FILES - 2; index >= 1; index -= 1) {
      try { await rename(`${this.#logFile}.${index}`, `${this.#logFile}.${index + 1}`) } catch { /* absent */ }
    }
    try { await rename(this.#logFile, `${this.#logFile}.1`) } catch { /* absent */ }
    await writeFile(this.#logFile, '', { mode: 0o600 })
  }
}

export function getDefaultLogDirectory(): string { return getApplicationStoragePaths().logs }
