import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { CapabilityOwnershipRegistry } from '../security/capability-ownership-registry'

const MAX_RESOURCE_URL_LENGTH = 16 * 1024
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_SVG_BYTES = 5 * 1024 * 1024
const MALFORMED_PERCENT_ENCODING = /%(?![0-9A-Fa-f]{2})/
const CONTROL_CHARACTER = /[\0-\x1F\x7F]/
const IMAGE_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml']
])

export interface ResourceScopeRecord {
  readonly scopeId: string
  readonly documentId: string
  readonly ownerWebContentsId: number
  readonly rootCanonicalPath: string
  readonly generation: number
  readonly createdAt: number
}

export interface ResolvedLocalResource {
  readonly scopeId: string
  readonly canonicalPath: string
  readonly mimeType: string
  readonly size: number
  readonly svg: boolean
  readonly generation: number
}

export type ResourceResolution =
  | { readonly ok: true; readonly resource: ResolvedLocalResource }
  | { readonly ok: false; readonly status: 400 | 403 | 404 | 413 | 415; readonly reason: string }

function containedBy(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function decodeRelativePath(encoded: string): string | null {
  if (!encoded || MALFORMED_PERCENT_ENCODING.test(encoded)) return null
  let decoded: string
  try { decoded = decodeURIComponent(encoded) } catch { return null }
  if (!decoded || CONTROL_CHARACTER.test(decoded) || decoded.includes('\\') || isAbsolute(decoded)) return null
  const segments = decoded.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return decoded
}

export class ResourceCapabilityBroker {
  readonly #ownership: CapabilityOwnershipRegistry
  readonly #scopes = new Map<string, ResourceScopeRecord>()
  readonly #scopeByDocument = new Map<string, string>()
  readonly #cache = new Map<string, ResolvedLocalResource>()

  constructor(ownership: CapabilityOwnershipRegistry) {
    this.#ownership = ownership
  }

  bindDocument(documentId: string, ownerWebContentsId: number, documentDirectory: string): string {
    const existingId = this.#scopeByDocument.get(documentId)
    const existing = existingId ? this.#scopes.get(existingId) : undefined
    if (existing && existing.ownerWebContentsId === ownerWebContentsId && existing.rootCanonicalPath === documentDirectory) {
      return existing.scopeId
    }
    if (existing) this.#revokeScope(existing.scopeId)

    const scopeId = randomUUID()
    const record: ResourceScopeRecord = Object.freeze({
      scopeId,
      documentId,
      ownerWebContentsId,
      rootCanonicalPath: documentDirectory,
      generation: (existing?.generation ?? 0) + 1,
      createdAt: Date.now()
    })
    this.#scopes.set(scopeId, record)
    this.#scopeByDocument.set(documentId, scopeId)
    this.#ownership.register(scopeId, 'resource', ownerWebContentsId)
    return scopeId
  }

  rebindDocument(documentId: string, ownerWebContentsId: number, documentDirectory: string): string {
    const existingId = this.#scopeByDocument.get(documentId)
    const existing = existingId ? this.#scopes.get(existingId) : undefined
    if (!existing) return this.bindDocument(documentId, ownerWebContentsId, documentDirectory)
    if (existing.ownerWebContentsId !== ownerWebContentsId) throw new Error('Resource scope owner mismatch.')

    const record: ResourceScopeRecord = Object.freeze({
      ...existing,
      rootCanonicalPath: documentDirectory,
      generation: existing.generation + 1
    })
    this.#scopes.set(existing.scopeId, record)
    this.#clearScopeCache(existing.scopeId)
    return existing.scopeId
  }

  scopeForDocument(documentId: string, ownerWebContentsId: number): string | null {
    const scopeId = this.#scopeByDocument.get(documentId)
    if (!scopeId) return null
    const record = this.#scopes.get(scopeId)
    if (!record || record.ownerWebContentsId !== ownerWebContentsId) return null
    return scopeId
  }

  ownsScope(scopeId: string, ownerWebContentsId: number): boolean {
    const record = this.#scopes.get(scopeId)
    return !!record &&
      record.ownerWebContentsId === ownerWebContentsId &&
      this.#ownership.owns(scopeId, 'resource', ownerWebContentsId)
  }

  ownsProtocolRequest(rawUrl: string, ownerWebContentsId: number): boolean {
    if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) return false
    if (!rawUrl || rawUrl.length > MAX_RESOURCE_URL_LENGTH || CONTROL_CHARACTER.test(rawUrl)) return false
    try {
      const parsed = new URL(rawUrl)
      return parsed.protocol === 'markhere-resource:' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        !parsed.search &&
        !parsed.hash &&
        this.ownsScope(parsed.hostname, ownerWebContentsId)
    } catch {
      return false
    }
  }

  invalidateDocument(documentId: string, ownerWebContentsId: number): void {
    const scopeId = this.scopeForDocument(documentId, ownerWebContentsId)
    if (scopeId) this.#clearScopeCache(scopeId)
  }

  revokeDocument(documentId: string): void {
    const scopeId = this.#scopeByDocument.get(documentId)
    if (scopeId) this.#revokeScope(scopeId)
  }

  revokeAllForWebContents(ownerWebContentsId: number): void {
    for (const record of [...this.#scopes.values()]) {
      if (record.ownerWebContentsId === ownerWebContentsId) this.#revokeScope(record.scopeId)
    }
  }

  async resolveProtocolRequest(rawUrl: string): Promise<ResourceResolution> {
    if (!rawUrl || rawUrl.length > MAX_RESOURCE_URL_LENGTH || CONTROL_CHARACTER.test(rawUrl)) {
      return { ok: false, status: 400, reason: 'invalid-resource-url' }
    }

    let parsed: URL
    try { parsed = new URL(rawUrl) } catch { return { ok: false, status: 400, reason: 'malformed-resource-url' } }
    if (parsed.protocol !== 'markhere-resource:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
      return { ok: false, status: 400, reason: 'unsupported-resource-url' }
    }

    const scope = this.#scopes.get(parsed.hostname)
    if (!scope) return { ok: false, status: 404, reason: 'unknown-resource-scope' }

    const rawPath = parsed.pathname
    if (!rawPath.startsWith('/r/')) return { ok: false, status: 400, reason: 'invalid-resource-route' }
    const encodedRelative = rawPath.slice('/r/'.length)
    const decodedRelative = decodeRelativePath(encodedRelative)
    if (!decodedRelative) return { ok: false, status: 403, reason: 'blocked-resource-path' }

    const cacheKey = `${scope.scopeId}:${scope.generation}:${decodedRelative}`
    // Never trust a cached canonical path without re-running realpath. A file
    // inside the document directory can be replaced by a symlink after the
    // previous request; containment therefore remains a per-request check.
    try {
      const canonicalRoot = await realpath(scope.rootCanonicalPath)
      const requested = resolve(canonicalRoot, decodedRelative)
      if (!containedBy(canonicalRoot, requested)) return { ok: false, status: 403, reason: 'resource-escape' }
      const canonicalTarget = await realpath(requested)
      if (!containedBy(canonicalRoot, canonicalTarget)) return { ok: false, status: 403, reason: 'resource-symlink-escape' }

      const info = await stat(canonicalTarget)
      if (!info.isFile()) return { ok: false, status: 404, reason: 'resource-not-file' }

      const extension = extname(canonicalTarget).toLocaleLowerCase('en-US')
      const mimeType = IMAGE_TYPES.get(extension)
      if (!mimeType) return { ok: false, status: 415, reason: 'resource-type-not-allowed' }
      const byteLimit = extension === '.svg' ? MAX_SVG_BYTES : MAX_IMAGE_BYTES
      if (info.size > byteLimit) return { ok: false, status: 413, reason: 'resource-too-large' }

      const resource: ResolvedLocalResource = Object.freeze({
        scopeId: scope.scopeId,
        canonicalPath: canonicalTarget,
        mimeType,
        size: info.size,
        svg: extension === '.svg',
        generation: scope.generation
      })
      this.#cache.set(cacheKey, resource)
      return { ok: true, resource }
    } catch {
      return { ok: false, status: 404, reason: 'resource-not-found' }
    }
  }

  #clearScopeCache(scopeId: string): void {
    for (const key of this.#cache.keys()) if (key.startsWith(`${scopeId}:`)) this.#cache.delete(key)
  }

  #revokeScope(scopeId: string): void {
    const record = this.#scopes.get(scopeId)
    if (!record) return
    this.#scopes.delete(scopeId)
    this.#scopeByDocument.delete(record.documentId)
    this.#clearScopeCache(scopeId)
    this.#ownership.revoke(scopeId)
  }
}
