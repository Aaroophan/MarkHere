import { classifyRemoteImageUrl } from '@markhere/security-core'

const MAX_APPROVED_URLS_PER_DOCUMENT = 128

interface ApprovalRecord {
  readonly documentId: string
  readonly ownerWebContentsId: number
  readonly urls: ReadonlySet<string>
}

export class RemoteResourceApprovalRegistry {
  readonly #records = new Map<string, ApprovalRecord>()

  approve(documentId: string, ownerWebContentsId: number, urls: readonly string[]): number {
    const approved = new Set<string>()
    for (const raw of urls.slice(0, MAX_APPROVED_URLS_PER_DOCUMENT)) {
      const decision = classifyRemoteImageUrl(raw, 'allow-https')
      if (decision.decision === 'allow') approved.add(decision.normalizedUrl)
    }
    this.#records.set(documentId, { documentId, ownerWebContentsId, urls: approved })
    return approved.size
  }

  isApproved(rawUrl: string, ownerWebContentsId: number): boolean {
    const decision = classifyRemoteImageUrl(rawUrl, 'allow-https')
    if (decision.decision !== 'allow') return false
    for (const record of this.#records.values()) {
      if (record.ownerWebContentsId === ownerWebContentsId && record.urls.has(decision.normalizedUrl)) return true
    }
    return false
  }

  revokeDocument(documentId: string): void { this.#records.delete(documentId) }
  revokeAllForWebContents(ownerWebContentsId: number): void {
    for (const [documentId, record] of this.#records) if (record.ownerWebContentsId === ownerWebContentsId) this.#records.delete(documentId)
  }
}
