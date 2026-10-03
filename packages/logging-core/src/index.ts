export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type LogProcess = 'main' | 'renderer' | 'utility' | 'pdf-renderer'
export type SafeLogValue = string | number | boolean | null

export interface LogEvent {
  readonly timestamp: string
  readonly level: LogLevel
  readonly event: string
  readonly process: LogProcess
  readonly appVersion: string
  readonly buildChannel: string
  readonly correlationId?: string
  readonly windowId?: string
  readonly documentId?: string
  readonly jobId?: string
  readonly durationMs?: number
  readonly result?: string
  readonly errorCode?: string
  readonly metadata?: Readonly<Record<string, SafeLogValue>>
}

export interface LogContext extends Partial<Omit<LogEvent, 'timestamp' | 'level' | 'event' | 'process' | 'appVersion' | 'buildChannel' | 'metadata'>> {
  readonly metadata?: Readonly<Record<string, unknown>>
}

const SENSITIVE_KEY = /(markdown|body|content|clipboard|recovery|secret|token|password|cookie|authorization|bytes|html|query|selection|stack|environment|env)/i
const PATH_KEY = /(path|directory|folder|filename|filePath|displayPath)/i
const URL_KEY = /(url|uri|href)/i
const CONTROL = /[\0-\x1f\x7f]/g

export function sanitizeLogString(value: string, maxLength = 512): string {
  return value.replace(CONTROL, ' ').slice(0, maxLength)
}

export function redactUrlForLog(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol === 'mailto:') return 'mailto:<redacted>'
    return `${url.protocol}//${url.host}/<redacted>`
  } catch { return '<invalid-url>' }
}

export function redactPathForLog(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  const basename = parts.at(-1) ?? '<path>'
  return `<redacted>/${sanitizeLogString(basename, 120)}`
}

export function sanitizeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, SafeLogValue>> | undefined {
  if (!metadata) return undefined
  const output: Record<string, SafeLogValue> = {}
  for (const [rawKey, rawValue] of Object.entries(metadata).slice(0, 64)) {
    const key = sanitizeLogString(rawKey, 80)
    if (SENSITIVE_KEY.test(key)) { output[key] = '<redacted>'; continue }
    if (rawValue === null || typeof rawValue === 'boolean' || typeof rawValue === 'number') { output[key] = rawValue; continue }
    if (typeof rawValue !== 'string') { output[key] = '<redacted>'; continue }
    output[key] = URL_KEY.test(key) ? redactUrlForLog(rawValue) : PATH_KEY.test(key) ? redactPathForLog(rawValue) : sanitizeLogString(rawValue)
  }
  return output
}
