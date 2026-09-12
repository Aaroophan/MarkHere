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

export interface OpenDocumentDTO {
  readonly documentId: string
  readonly displayPath: string
  readonly basename: string
  readonly markdown: string
  readonly revision: number
  readonly persistedRevision: number
  readonly fingerprint: FileFingerprint
  readonly textFormat: TextFormatMetadata
  readonly writable: boolean
  readonly resourceScopeId: string
}

export interface SaveDocumentRequest {
  readonly documentId: string
  readonly revision: number
  readonly markdown: string
  readonly expectedDiskFingerprint: FileFingerprint | null
  readonly textFormat: TextFormatMetadata
}

export interface SaveDocumentAsRequest {
  readonly documentId: string
  readonly revision: number
  readonly markdown: string
  readonly targetSelectionToken: string
  readonly textFormat: TextFormatMetadata
}

export interface SaveDocumentResult {
  readonly documentId: string
  readonly savedRevision: number
  readonly displayPath: string
  readonly fingerprint: FileFingerprint
  readonly textFormat: TextFormatMetadata
  readonly resourceScopeId?: string
}

export interface DocumentStatDTO {
  readonly documentId: string
  readonly displayPath: string
  readonly fingerprint: FileFingerprint
  readonly writable: boolean
}

export interface RenameDocumentRequest {
  readonly documentId: string
  readonly newBasename: string
}

export interface CopyImportedImageRequest {
  readonly documentId: string
  readonly temporaryImageToken: string
  readonly preferredName?: string
}

export interface FileMutationResult {
  readonly displayPath: string
}

export interface ImportedImageResult {
  readonly markdownPath: string
  readonly displayPath: string
}
