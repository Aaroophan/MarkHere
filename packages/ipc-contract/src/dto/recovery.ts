export interface RecoveryUpdateRequest {
  readonly documentId: string
  readonly revision: number
  readonly persistedRevision: number
  readonly markdown: string
}

export interface RecoveryUpdateResult {
  readonly snapshotId: string
  readonly revision: number
}

export interface RecoverySummary {
  readonly snapshotId: string
  readonly documentId: string
  readonly displayName: string
  readonly revision: number
  readonly updatedAt: number
}

export interface RecoveryDocumentDTO extends RecoverySummary {
  readonly markdown: string
}
