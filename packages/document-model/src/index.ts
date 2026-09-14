import type { Brand } from '@markhere/shared'

export type DocumentId = Brand<string, 'DocumentId'>
export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type ExportJobId = Brand<string, 'ExportJobId'>
export type CapabilityId = Brand<string, 'CapabilityId'>
export type DocumentRevision = Brand<number, 'DocumentRevision'>
export type DocumentMode = 'preview' | 'wysiwyg' | 'source' | 'split'
export type MutationSource = 'wysiwyg' | 'source' | 'command' | 'reload' | 'recovery' | 'system'
export type DocumentLifecycleState = 'loading' | 'ready' | 'dirty' | 'saving' | 'conflict' | 'closing' | 'failed'
export type ConflictReason = 'external-modification' | 'external-deletion' | 'external-rename' | 'save-precondition-failed'
export type OpenedVia = 'dialog' | 'explorer' | 'cli' | 'workspace' | 'recent' | 'link' | 'recovery'

export interface FileFingerprint {
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs?: number
  readonly sha256?: string
  readonly platformFileId?: string
}

export interface TextFormatMetadata {
  readonly encoding: string
  readonly detectedEncodingName?: string
  readonly lineEnding: 'lf' | 'crlf' | 'cr'
  readonly hasFinalNewline: boolean
  readonly bom: boolean
}

export interface MutationMetadata {
  readonly source: MutationSource
  readonly transactionId: string
  readonly createdAt: string
  readonly baseRevision: number
  readonly resultingRevision: number
  readonly summary?: string
}

export interface FileBinding {
  readonly displayPath: string
  readonly capabilityId: string
  readonly basename: string
  readonly extension: string
  readonly parentDisplayPath: string
  readonly openedVia: OpenedVia
  readonly writable: boolean
}

export interface DocumentBuffer {
  readonly markdown: string
  readonly revision: number
  readonly persistedRevision: number
  readonly dirty: boolean
  readonly textFormat: TextFormatMetadata
  readonly diskFingerprint: FileFingerprint | null
  readonly lastMutation: MutationMetadata | null
}

export interface TextPosition {
  readonly line: number
  readonly column: number
  readonly offset?: number
}

export interface TextRange {
  readonly anchor: TextPosition
  readonly head: TextPosition
}

export interface StructuralAnchor {
  readonly blockId?: string
  readonly headingSlug?: string
  readonly sourceLine?: number
  readonly sourceOffset?: number
  readonly intraBlockRatio?: number
}

export interface SourceViewState {
  readonly wrap: boolean
  readonly cursor?: TextPosition
  readonly selection?: TextRange
  readonly scrollTop?: number
  readonly structuralAnchor?: StructuralAnchor
}

export interface WysiwygViewState {
  readonly focusMode: boolean
  readonly typewriterMode: boolean
  /** Adapter-owned, opaque bookmark. Never canonical document content. */
  readonly selectionBookmark?: unknown
  readonly scrollAnchor?: StructuralAnchor
}

export interface PreviewViewState {
  readonly renderedRevision: number | null
  readonly renderStatus: 'idle' | 'rendering' | 'ready' | 'error'
  readonly scrollAnchor?: StructuralAnchor
}

export interface SplitViewState {
  readonly ratio: number
  readonly syncScroll: boolean
  readonly sourceSide: 'left' | 'right'
  readonly pendingPreviewRevision?: number
  readonly scrollAnchor?: StructuralAnchor
}

export interface DocumentViewState {
  readonly mode: DocumentMode
  readonly source: SourceViewState
  readonly wysiwyg: WysiwygViewState
  readonly preview: PreviewViewState
  readonly split: SplitViewState
}

export interface DocumentConflict {
  readonly reason: ConflictReason
  readonly detectedAt: string
  readonly localRevision: number
  readonly expectedDiskFingerprint: FileFingerprint | null
  readonly actualDiskFingerprint: FileFingerprint | null
}

export interface RecoveryState {
  readonly latestSnapshotId: string | null
  readonly latestSnapshotRevision: number | null
  readonly lastSnapshotAt: string | null
  readonly pending: boolean
}

export interface ResourceScopeSummary {
  readonly documentResourceScopeId: string | null
  readonly workspaceId: string | null
  readonly remoteImages: 'block' | 'ask' | 'allow-https'
}

export interface DocumentSession {
  readonly id: DocumentId
  readonly title: string
  readonly file: FileBinding | null
  readonly buffer: DocumentBuffer
  readonly view: DocumentViewState
  readonly conflict: DocumentConflict | null
  readonly recovery: RecoveryState
  readonly resourceScope: ResourceScopeSummary
  readonly lifecycle: DocumentLifecycleState
  readonly openedAt: string
  readonly lastActivatedAt: string
}

export interface CommitDocumentMutationRequest {
  readonly baseRevision: number
  readonly markdown: string
  readonly source: MutationSource
  readonly summary?: string
  readonly transactionId?: string
  readonly createdAt?: string
}

export class StaleDocumentRevisionError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Document mutation expected revision ${expected}, but current revision is ${actual}.`)
    this.name = 'StaleDocumentRevisionError'
  }
}

export function createInitialViewState(mode: DocumentMode = 'preview'): DocumentViewState {
  return {
    mode,
    source: { wrap: true },
    wysiwyg: { focusMode: false, typewriterMode: false },
    preview: { renderedRevision: null, renderStatus: 'idle' },
    split: { ratio: 0.5, syncScroll: true, sourceSide: 'left' }
  }
}

export function createLoadedDocumentSession(input: {
  id: DocumentId
  title: string
  markdown: string
  file: FileBinding
  textFormat: TextFormatMetadata
  fingerprint: FileFingerprint
  resourceScopeId: string
  openedAt?: string
  mode?: DocumentMode
}): DocumentSession {
  const now = input.openedAt ?? new Date().toISOString()
  return freezeSession({
    id: input.id,
    title: input.title,
    file: input.file,
    buffer: buffer(input.markdown, 1, 1, input.textFormat, input.fingerprint, null),
    view: createInitialViewState(input.mode),
    conflict: null,
    recovery: emptyRecoveryState(),
    resourceScope: { documentResourceScopeId: input.resourceScopeId, workspaceId: null, remoteImages: 'block' },
    lifecycle: 'ready',
    openedAt: now,
    lastActivatedAt: now
  })
}

export function createUntitledDocumentSession(input: {
  id: DocumentId
  title?: string
  markdown?: string
  textFormat?: TextFormatMetadata
  openedAt?: string
  mode?: DocumentMode
}): DocumentSession {
  const now = input.openedAt ?? new Date().toISOString()
  const textFormat = input.textFormat ?? { encoding: 'utf8', lineEnding: 'lf', hasFinalNewline: false, bom: false }
  return freezeSession({
    id: input.id,
    title: input.title ?? 'Untitled',
    file: null,
    buffer: buffer(input.markdown ?? '', 1, 0, textFormat, null, null),
    view: createInitialViewState(input.mode),
    conflict: null,
    recovery: emptyRecoveryState(),
    resourceScope: { documentResourceScopeId: null, workspaceId: null, remoteImages: 'block' },
    lifecycle: 'dirty',
    openedAt: now,
    lastActivatedAt: now
  })
}

export function commitDocumentMutation(session: DocumentSession, request: CommitDocumentMutationRequest): DocumentSession {
  if (request.baseRevision !== session.buffer.revision) {
    throw new StaleDocumentRevisionError(request.baseRevision, session.buffer.revision)
  }
  const nextRevision = session.buffer.revision + 1
  const metadata: MutationMetadata = {
    source: request.source,
    transactionId: request.transactionId ?? globalThis.crypto.randomUUID(),
    createdAt: request.createdAt ?? new Date().toISOString(),
    baseRevision: request.baseRevision,
    resultingRevision: nextRevision,
    ...(request.summary ? { summary: request.summary } : {})
  }
  return freezeSession({
    ...session,
    buffer: buffer(request.markdown, nextRevision, session.buffer.persistedRevision, session.buffer.textFormat, session.buffer.diskFingerprint, metadata),
    lifecycle: session.conflict ? 'conflict' : 'dirty',
    lastActivatedAt: metadata.createdAt
  })
}

export function applyPersistedRevision(session: DocumentSession, savedRevision: number, fingerprint: FileFingerprint, textFormat = session.buffer.textFormat): DocumentSession {
  if (savedRevision < session.buffer.persistedRevision || savedRevision > session.buffer.revision) return session
  const dirty = session.buffer.revision !== savedRevision
  return freezeSession({
    ...session,
    buffer: buffer(session.buffer.markdown, session.buffer.revision, savedRevision, textFormat, fingerprint, session.buffer.lastMutation),
    conflict: null,
    lifecycle: dirty ? 'dirty' : 'ready'
  })
}

export function applySaveAsBinding(session: DocumentSession, input: { savedRevision: number; file: FileBinding; fingerprint: FileFingerprint; textFormat: TextFormatMetadata; resourceScopeId: string }): DocumentSession {
  const persisted = applyPersistedRevision(session, input.savedRevision, input.fingerprint, input.textFormat)
  return freezeSession({
    ...persisted,
    title: input.file.basename,
    file: input.file,
    resourceScope: { ...persisted.resourceScope, documentResourceScopeId: input.resourceScopeId }
  })
}

export function applyReload(session: DocumentSession, input: { markdown: string; fingerprint: FileFingerprint; textFormat: TextFormatMetadata; transactionId?: string; createdAt?: string }): DocumentSession {
  const nextRevision = session.buffer.revision + 1
  const createdAt = input.createdAt ?? new Date().toISOString()
  const metadata: MutationMetadata = {
    source: 'reload',
    transactionId: input.transactionId ?? globalThis.crypto.randomUUID(),
    createdAt,
    baseRevision: session.buffer.revision,
    resultingRevision: nextRevision,
    summary: 'external-reload'
  }
  return freezeSession({
    ...session,
    buffer: buffer(input.markdown, nextRevision, nextRevision, input.textFormat, input.fingerprint, metadata),
    conflict: null,
    lifecycle: 'ready',
    lastActivatedAt: createdAt
  })
}

export function enterDocumentConflict(session: DocumentSession, conflict: Omit<DocumentConflict, 'localRevision' | 'detectedAt'> & { detectedAt?: string }): DocumentSession {
  return freezeSession({
    ...session,
    conflict: {
      ...conflict,
      localRevision: session.buffer.revision,
      detectedAt: conflict.detectedAt ?? new Date().toISOString()
    },
    lifecycle: 'conflict'
  })
}

export function clearDocumentConflictKeepingLocal(session: DocumentSession): DocumentSession {
  return freezeSession({ ...session, conflict: null, lifecycle: session.buffer.dirty ? 'dirty' : 'ready' })
}

export function updateRecoveryState(session: DocumentSession, recovery: RecoveryState): DocumentSession {
  return freezeSession({ ...session, recovery: Object.freeze({ ...recovery }) })
}

export function updateDocumentViewState(
  session: DocumentSession,
  updater: (current: DocumentViewState) => DocumentViewState
): DocumentSession {
  const next = updater(session.view)
  return freezeSession({ ...session, view: Object.freeze({ ...next }) })
}

export function setDocumentMode(session: DocumentSession, mode: DocumentMode): DocumentSession {
  if (session.view.mode === mode) return session
  return updateDocumentViewState(session, (view) => ({ ...view, mode }))
}

export function updateSourceViewState(session: DocumentSession, patch: Partial<SourceViewState>): DocumentSession {
  return updateDocumentViewState(session, (view) => ({ ...view, source: Object.freeze({ ...view.source, ...patch }) }))
}

export function updateWysiwygViewState(session: DocumentSession, patch: Partial<WysiwygViewState>): DocumentSession {
  return updateDocumentViewState(session, (view) => ({ ...view, wysiwyg: Object.freeze({ ...view.wysiwyg, ...patch }) }))
}

export function updatePreviewViewState(session: DocumentSession, patch: Partial<PreviewViewState>): DocumentSession {
  return updateDocumentViewState(session, (view) => ({ ...view, preview: Object.freeze({ ...view.preview, ...patch }) }))
}

export function updateSplitViewState(session: DocumentSession, patch: Partial<SplitViewState>): DocumentSession {
  const ratio = patch.ratio === undefined ? session.view.split.ratio : Math.min(0.85, Math.max(0.15, patch.ratio))
  return updateDocumentViewState(session, (view) => ({
    ...view,
    split: Object.freeze({ ...view.split, ...patch, ratio })
  }))
}

function emptyRecoveryState(): RecoveryState {
  return { latestSnapshotId: null, latestSnapshotRevision: null, lastSnapshotAt: null, pending: false }
}

function buffer(markdown: string, revision: number, persistedRevision: number, textFormat: TextFormatMetadata, diskFingerprint: FileFingerprint | null, lastMutation: MutationMetadata | null): DocumentBuffer {
  return Object.freeze({
    markdown,
    revision,
    persistedRevision,
    dirty: revision !== persistedRevision,
    textFormat: Object.freeze({ ...textFormat }),
    diskFingerprint: diskFingerprint ? Object.freeze({ ...diskFingerprint }) : null,
    lastMutation: lastMutation ? Object.freeze({ ...lastMutation }) : null
  })
}

function freezeSession(session: DocumentSession): DocumentSession {
  if (session.buffer.dirty !== (session.buffer.revision !== session.buffer.persistedRevision)) {
    throw new Error('DocumentBuffer invariant violated: dirty must equal revision !== persistedRevision.')
  }
  return Object.freeze(session)
}
