import { defineStore } from 'pinia'
import type { DocumentExternalChangeEvent, OpenDocumentDTO, RecoveryDocumentDTO, SaveDocumentResult } from '@markhere/ipc-contract'
import type { DocumentId, DocumentMode, DocumentSession, FileBinding, PreviewViewState, SourceViewState, SplitViewState, WysiwygViewState } from '@markhere/document-model'
import {
  applyPersistedRevision,
  applyReload,
  applySaveAsBinding,
  commitDocumentMutation,
  createLoadedDocumentSession,
  createUntitledDocumentSession,
  enterDocumentConflict,
  setDocumentMode,
  updatePreviewViewState,
  updateSourceViewState,
  updateSplitViewState,
  updateWysiwygViewState
} from '@markhere/document-model'

interface State { sessions: Record<string, DocumentSession> }

const recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleRecovery(session: DocumentSession): void {
  const existing = recoveryTimers.get(session.id)
  if (existing) clearTimeout(existing)
  if (!session.buffer.dirty) return
  recoveryTimers.set(session.id, setTimeout(() => {
    recoveryTimers.delete(session.id)
    void window.markhere.recovery.updateSnapshot({
      documentId: session.id,
      revision: session.buffer.revision,
      persistedRevision: session.buffer.persistedRevision,
      markdown: session.buffer.markdown,
      ...(session.file ? { displayPath: session.file.displayPath } : {}),
      textFormat: session.buffer.textFormat,
      baseDiskFingerprint: session.buffer.diskFingerprint
    })
  }, 2_000))
}

export const useDocumentSessionStore = defineStore('documents', {
  state: (): State => ({ sessions: {} }),
  actions: {
    open(dto: OpenDocumentDTO, mode: DocumentMode = 'preview'): DocumentSession {
      const file: FileBinding = {
        displayPath: dto.displayPath,
        capabilityId: dto.documentId,
        basename: dto.basename,
        extension: dto.basename.includes('.') ? `.${dto.basename.split('.').pop() ?? ''}` : '',
        parentDisplayPath: dto.displayPath.replace(/[\\/][^\\/]+$/, ''),
        openedVia: 'dialog',
        writable: dto.writable
      }
      const session = createLoadedDocumentSession({
        id: dto.documentId as DocumentId,
        title: dto.basename,
        markdown: dto.markdown,
        file,
        textFormat: dto.textFormat,
        fingerprint: dto.fingerprint,
        resourceScopeId: dto.resourceScopeId,
        mode
      })
      this.sessions[dto.documentId] = session
      return session
    },
    commit(documentId: string, markdown: string, source: 'wysiwyg' | 'source' | 'command' | 'recovery' | 'system', summary?: string): DocumentSession {
      const current = this.getRequired(documentId)
      const next = commitDocumentMutation(current, { baseRevision: current.buffer.revision, markdown, source, ...(summary ? { summary } : {}) })
      this.sessions[documentId] = next
      scheduleRecovery(next)
      return next
    },
    applySave(result: SaveDocumentResult): void {
      const current = this.getRequired(result.documentId)
      this.sessions[result.documentId] = applyPersistedRevision(current, result.savedRevision, result.fingerprint, result.textFormat)
    },
    applySaveAs(result: SaveDocumentResult): void {
      const current = this.getRequired(result.documentId)
      const basename = result.displayPath.split(/[\\/]/).pop() ?? result.displayPath
      const file: FileBinding = {
        displayPath: result.displayPath,
        capabilityId: result.documentId,
        basename,
        extension: basename.includes('.') ? `.${basename.split('.').pop() ?? ''}` : '',
        parentDisplayPath: result.displayPath.replace(/[\\/][^\\/]+$/, ''),
        openedVia: 'dialog',
        writable: true
      }
      this.sessions[result.documentId] = applySaveAsBinding(current, {
        savedRevision: result.savedRevision,
        file,
        fingerprint: result.fingerprint,
        textFormat: result.textFormat,
        resourceScopeId: result.resourceScopeId ?? current.resourceScope.documentResourceScopeId ?? result.documentId
      })
    },
    applyReload(dto: OpenDocumentDTO): void {
      const current = this.getRequired(dto.documentId)
      this.sessions[dto.documentId] = applyReload(current, { markdown: dto.markdown, fingerprint: dto.fingerprint, textFormat: dto.textFormat })
    },
    handleExternalChange(event: DocumentExternalChangeEvent): void {
      const current = this.sessions[event.documentId]
      if (!current) return
      if (current.buffer.dirty || event.kind === 'deleted') {
        this.sessions[event.documentId] = enterDocumentConflict(current, {
          reason: event.kind === 'deleted' ? 'external-deletion' : event.kind === 'renamed' ? 'external-rename' : 'external-modification',
          expectedDiskFingerprint: current.buffer.diskFingerprint,
          actualDiskFingerprint: event.actualFingerprint ?? null,
          ...(event.detectedAt ? { detectedAt: event.detectedAt } : {})
        })
      }
    },

    enterSaveConflict(documentId: string, actualFingerprint: DocumentSession['buffer']['diskFingerprint']): void {
      const current = this.getRequired(documentId)
      this.sessions[documentId] = enterDocumentConflict(current, {
        reason: 'save-precondition-failed',
        expectedDiskFingerprint: current.buffer.diskFingerprint,
        actualDiskFingerprint: actualFingerprint
      })
    },
    restoreRecovery(dto: RecoveryDocumentDTO): DocumentSession {
      let session = createUntitledDocumentSession({
        id: dto.documentId as DocumentId,
        title: dto.title,
        markdown: dto.markdown,
        textFormat: dto.textFormat
      })
      // Recovery is intentionally dirty even when its source revision happened
      // to match an old persisted number; restoring must never overwrite disk implicitly.
      if (session.buffer.revision !== dto.revision) {
        session = commitDocumentMutation(session, {
          baseRevision: session.buffer.revision,
          markdown: dto.markdown,
          source: 'recovery',
          summary: 'restore-recovery'
        })
      }
      this.sessions[dto.documentId] = session
      scheduleRecovery(session)
      return session
    },
    setMode(documentId: string, mode: DocumentMode): void {
      this.sessions[documentId] = setDocumentMode(this.getRequired(documentId), mode)
    },
    updateSourceView(documentId: string, patch: Partial<SourceViewState>): void {
      this.sessions[documentId] = updateSourceViewState(this.getRequired(documentId), patch)
    },
    updateWysiwygView(documentId: string, patch: Partial<WysiwygViewState>): void {
      this.sessions[documentId] = updateWysiwygViewState(this.getRequired(documentId), patch)
    },
    updatePreviewView(documentId: string, patch: Partial<PreviewViewState>): void {
      this.sessions[documentId] = updatePreviewViewState(this.getRequired(documentId), patch)
    },
    updateSplitView(documentId: string, patch: Partial<SplitViewState>): void {
      this.sessions[documentId] = updateSplitViewState(this.getRequired(documentId), patch)
    },
    getRequired(documentId: string): DocumentSession {
      const session = this.sessions[documentId]
      if (!session) throw new Error(`Document '${documentId}' is not open.`)
      return session
    }
  }
})
