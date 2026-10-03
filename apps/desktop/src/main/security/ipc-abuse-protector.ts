import { SECURITY_BUDGETS } from '@markhere/security-core'

interface SenderBucket { windowStart: number; invalidCount: number; blockedUntil: number }

export class IpcAbuseProtector {
  readonly #buckets = new Map<number, SenderBucket>()

  isBlocked(webContentsId: number, now = Date.now()): boolean {
    const bucket = this.#buckets.get(webContentsId)
    return !!bucket && bucket.blockedUntil > now
  }

  noteInvalid(webContentsId: number, now = Date.now()): boolean {
    const previous = this.#buckets.get(webContentsId)
    const bucket: SenderBucket = !previous || now - previous.windowStart >= 60_000
      ? { windowStart: now, invalidCount: 1, blockedUntil: 0 }
      : { ...previous, invalidCount: previous.invalidCount + 1 }
    if (bucket.invalidCount > SECURITY_BUDGETS.maxInvalidIpcPerWindowPerMinute) bucket.blockedUntil = now + 60_000
    this.#buckets.set(webContentsId, bucket)
    return bucket.blockedUntil > now
  }

  clear(webContentsId: number): void { this.#buckets.delete(webContentsId) }
}

export function exceedsGenericIpcBudget(value: unknown): boolean {
  let bytes = 0
  let nodes = 0
  const visit = (item: unknown, depth: number): boolean => {
    nodes += 1
    if (nodes > 10_000 || depth > 32) return true
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item, 'utf8')
      return bytes > SECURITY_BUDGETS.maxIpcStringBytes
    }
    if (item instanceof Uint8Array) {
      bytes += item.byteLength
      return bytes > SECURITY_BUDGETS.maxIpcStringBytes
    }
    if (Array.isArray(item)) return item.some((child) => visit(child, depth + 1))
    if (item && typeof item === 'object') return Object.values(item as Record<string, unknown>).some((child) => visit(child, depth + 1))
    return false
  }
  return visit(value, 0)
}
