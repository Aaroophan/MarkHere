import type { FileFingerprint, TextFormatMetadata } from './files'

export interface RecoveryUpdateRequest {
  readonly documentId: string
  readonly revision: number
  readonly persistedRevision: number
  readonly markdown: string
  readonly displayPath?: string
  readonly textFormat?: TextFormatMetadata
  readonly baseDiskFingerprint?: FileFingerprint | null
}

export interface RecoveryUpdateResult {
  readonly snapshotId: string | null
  readonly savedRevision: number
}

export interface RecoverySummary {
  readonly snapshotId: string
  readonly documentId: string
  readonly title: string
  readonly revision: number
  readonly createdAt: string
  readonly displayPath?: string
}

export interface RecoveryDocumentDTO extends RecoverySummary {
  readonly markdown: string
  readonly persistedRevision: number
  readonly textFormat: TextFormatMetadata
  readonly baseDiskFingerprint: FileFingerprint | null
}
