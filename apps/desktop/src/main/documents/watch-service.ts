import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { FileFingerprint } from '@markhere/ipc-contract'
import { fingerprintFile, fastFingerprintEqual } from './fingerprint'

export type SemanticFileChangeKind = 'changed' | 'deleted' | 'renamed'

export interface SemanticFileChange {
  readonly documentId: string
  readonly kind: SemanticFileChangeKind
  readonly actualFingerprint: FileFingerprint | null
  readonly selfWrite: boolean
}

interface ExpectedWriteRecord {
  readonly documentId: string
  readonly canonicalPath: string
  readonly fingerprint: FileFingerprint
  readonly saveToken: string
  readonly expiresAt: number
}

interface WatchRecord {
  readonly documentId: string
  canonicalPath: string
  readonly watcher: FSWatcher
  lastFingerprint: FileFingerprint | null
}

export class WatchService {
  readonly #watches = new Map<string, WatchRecord>()
  readonly #expected = new Map<string, ExpectedWriteRecord>()
  readonly #onChange: (change: SemanticFileChange) => void

  constructor(onChange: (change: SemanticFileChange) => void) {
    this.#onChange = onChange
  }

  watchDocument(documentId: string, canonicalPath: string): void {
    this.unwatchDocument(documentId)
    const watcher = watch(canonicalPath, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      atomic: 200,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
    })
    const record: WatchRecord = { documentId, canonicalPath, watcher, lastFingerprint: null }
    this.#watches.set(documentId, record)
    void fingerprintFile(canonicalPath, false).then((value) => { record.lastFingerprint = value }).catch(() => undefined)
    watcher.on('change', () => void this.#handle(documentId, canonicalPath, 'changed'))
    watcher.on('unlink', () => void this.#handleMissing(documentId, canonicalPath))
  }

  recordExpectedWrite(record: ExpectedWriteRecord): void {
    this.#prune()
    this.#expected.set(record.documentId, record)
  }

  clearExpectedWrite(documentId: string): void {
    this.#expected.delete(documentId)
  }

  unwatchDocument(documentId: string): void {
    const record = this.#watches.get(documentId)
    this.#watches.delete(documentId)
    this.#expected.delete(documentId)
    if (record) void record.watcher.close()
  }

  unwatchAll(): void {
    for (const documentId of [...this.#watches.keys()]) this.unwatchDocument(documentId)
  }

  async #handle(documentId: string, canonicalPath: string, kind: SemanticFileChangeKind): Promise<void> {
    this.#prune()
    let actualFingerprint: FileFingerprint | null = null
    if (kind !== 'deleted') {
      try { actualFingerprint = await fingerprintFile(canonicalPath, false) } catch { actualFingerprint = null }
    }
    const record = this.#watches.get(documentId)
    if (record && actualFingerprint) record.lastFingerprint = actualFingerprint
    const expected = this.#expected.get(documentId)
    let selfWrite = !!expected
      && expected.canonicalPath === canonicalPath
      && !!actualFingerprint
      && fastFingerprintEqual(expected.fingerprint, actualFingerprint)
    if (!selfWrite && expected?.fingerprint.sha256 && actualFingerprint && actualFingerprint.size === expected.fingerprint.size) {
      try {
        actualFingerprint = await fingerprintFile(canonicalPath, true)
        selfWrite = actualFingerprint.sha256 === expected.fingerprint.sha256
      } catch { selfWrite = false }
    }
    if (selfWrite) this.#expected.delete(documentId)
    this.#onChange({ documentId, kind, actualFingerprint, selfWrite })
  }

  async #handleMissing(documentId: string, canonicalPath: string): Promise<void> {
    const record = this.#watches.get(documentId)
    const platformFileId = record?.lastFingerprint?.platformFileId
    if (platformFileId) {
      const renamed = await this.#findSiblingByPlatformFileId(canonicalPath, platformFileId)
      if (renamed) {
        // A same-directory rename keeps file identity on common local filesystems.
        // We deliberately report a conflict instead of silently changing the
        // document capability: accepting the new pathname requires an explicit
        // user decision in the canonical document lifecycle.
        this.#onChange({ documentId, kind: 'renamed', actualFingerprint: renamed.fingerprint, selfWrite: false })
        return
      }
    }
    await this.#handle(documentId, canonicalPath, 'deleted')
  }

  async #findSiblingByPlatformFileId(oldPath: string, platformFileId: string): Promise<{ path: string; fingerprint: FileFingerprint } | null> {
    const parent = dirname(oldPath)
    try {
      const entries = await readdir(parent, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const candidate = join(parent, entry.name)
        try {
          const info = await stat(candidate)
          if (`${info.dev}:${info.ino}` !== platformFileId) continue
          return { path: candidate, fingerprint: await fingerprintFile(candidate, false) }
        } catch { /* entry raced with scan */ }
      }
    } catch { /* parent unavailable */ }
    return null
  }

  #prune(now = Date.now()): void {
    for (const [documentId, record] of this.#expected) {
      if (record.expiresAt <= now) this.#expected.delete(documentId)
    }
  }
}
