import { stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { ApiResult, ResolveDocumentLinkRequest, ResolvedDocumentLink } from '@markhere/ipc-contract'
import { normalizeHeadingFragment } from '@markhere/markdown-engine'
import { classifyExternalUrl } from '@markhere/security-core'
import type { FileCapabilityRecord, FileCapabilityRegistry } from '../documents/file-capability-registry'
import { identifyExistingPath, sameKnownPath } from '../documents/path-identity'
import type { SelectionTokenStore } from '../services/selection-token-store'
import { failure, ok } from '../services/api-results'
import type { ResourceCapabilityBroker } from './resource-capability-broker'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mmd', '.mdown', '.mdtext', '.mdtxt', '.mdx'])
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/
const CONTROL_CHARACTER = /[\0-\x1F\x7F]/
const MALFORMED_PERCENT_ENCODING = /%(?![0-9A-Fa-f]{2})/

function splitLocalHref(raw: string): { pathPart: string; fragment?: string } | null {
  if (!raw || raw.trim() !== raw || CONTROL_CHARACTER.test(raw) || MALFORMED_PERCENT_ENCODING.test(raw)) return null
  const query = raw.indexOf('?')
  if (query !== -1) return null
  const hash = raw.indexOf('#')
  const pathPartRaw = hash === -1 ? raw : raw.slice(0, hash)
  const fragmentRaw = hash === -1 ? undefined : raw.slice(hash + 1)
  try {
    return {
      pathPart: decodeURIComponent(pathPartRaw),
      ...(fragmentRaw !== undefined ? { fragment: decodeURIComponent(fragmentRaw) } : {})
    }
  } catch {
    return null
  }
}

export class ResourceService {
  readonly #files: FileCapabilityRegistry
  readonly #selections: SelectionTokenStore
  readonly #broker: ResourceCapabilityBroker

  constructor(files: FileCapabilityRegistry, selections: SelectionTokenStore, broker: ResourceCapabilityBroker) {
    this.#files = files
    this.#selections = selections
    this.#broker = broker
  }

  async resolveLink(request: ResolveDocumentLinkRequest, ownerWebContentsId: number): Promise<ApiResult<ResolvedDocumentLink>> {
    let source: FileCapabilityRecord
    try { source = this.#files.get(request.documentId, ownerWebContentsId, 'read') } catch {
      return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false)
    }

    const raw = request.href
    if (raw.startsWith('#')) {
      const fragment = raw.slice(1)
      return ok({ kind: 'anchor', headingSlug: normalizeHeadingFragment(fragment) })
    }

    // Treat Windows drive paths as paths before WHATWG URL parsing so `C:` is
    // never mistaken for an external URL scheme.
    const looksWindowsPath = WINDOWS_ABSOLUTE.test(raw)
    if (!looksWindowsPath) {
      const external = classifyExternalUrl(raw)
      if (external.decision === 'allow') return ok({ kind: 'external', url: external.normalizedUrl })
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
        return ok({ kind: 'blocked', reason: external.reason })
      }
    }

    const local = splitLocalHref(raw)
    if (!local || !local.pathPart) return ok({ kind: 'blocked', reason: 'invalid-local-document-link' })
    const candidate = isAbsolute(local.pathPart)
      ? local.pathPart
      : resolve(dirname(source.path.canonicalPath), local.pathPart)
    const extension = extname(candidate).toLocaleLowerCase('en-US')
    if (!MARKDOWN_EXTENSIONS.has(extension)) return ok({ kind: 'blocked', reason: 'document-type-not-supported' })

    try {
      const info = await stat(candidate)
      if (!info.isFile()) return ok({ kind: 'blocked', reason: 'document-not-file' })
      const identity = await identifyExistingPath(candidate)
      const existing = this.#files.listForWebContents(ownerWebContentsId).find((record) => sameKnownPath(record.path, identity))
      const token = this.#selections.issue('document-open', identity.canonicalPath, ownerWebContentsId)
      return ok({
        kind: 'document',
        ...(existing ? { documentId: existing.documentId } : {}),
        openToken: token.token,
        ...(local.fragment !== undefined ? { anchor: normalizeHeadingFragment(local.fragment) } : {})
      })
    } catch {
      return ok({ kind: 'blocked', reason: 'document-not-found' })
    }
  }

  invalidateDocumentCache(documentId: string, ownerWebContentsId: number): void {
    // Ownership validation is repeated here rather than trusting the caller.
    this.#files.get(documentId, ownerWebContentsId, 'read')
    this.#broker.invalidateDocument(documentId, ownerWebContentsId)
  }
}
