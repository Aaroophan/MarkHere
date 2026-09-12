import type { DocumentId, DocumentRevision, ExportJobId } from '@markhere/document-model'

export type ExportFormat = 'html' | 'pdf' | 'docx'

export interface ExportSnapshot {
  readonly jobId: ExportJobId
  readonly documentId: DocumentId
  readonly revision: DocumentRevision
  readonly markdown: string
  readonly format: ExportFormat
}
