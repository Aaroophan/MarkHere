import type { TextFormatMetadata } from './files'

export type ExportFormat = 'html' | 'pdf' | 'docx'
export type ExportJobKind = ExportFormat | 'print'
export type ExportStatus = 'queued' | 'preparing' | 'resolving-assets' | 'rendering' | 'writing' | 'completed' | 'failed' | 'cancelled'

export interface CommonExportOptions {
  readonly documentTitle?: string
  readonly themeId: string
  readonly includeFrontMatter: boolean
  readonly includeTableOfContents: boolean
}

export interface HtmlExportOptions extends CommonExportOptions {
  readonly imagePolicy: 'embed-local' | 'reference'
}

export interface PdfMarginsMm {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface PdfExportOptions extends CommonExportOptions {
  readonly pageSize: 'A4' | 'A3' | 'Letter' | 'Legal'
  readonly orientation: 'portrait' | 'landscape'
  readonly marginsMm: PdfMarginsMm
  readonly printBackground: boolean
  readonly displayHeaderFooter: boolean
  /** Plain user text; the privileged PDF adapter escapes it before forming an Electron header template. */
  readonly headerTemplate?: string
  /** Plain user text; the privileged PDF adapter escapes it before forming an Electron footer template. */
  readonly footerTemplate?: string
}

export interface DocxExportOptions extends CommonExportOptions {
  readonly pageSize: 'A4' | 'Letter'
  readonly orientation: 'portrait' | 'landscape'
  readonly includePageNumbers: boolean
  readonly codeStyle: 'shaded' | 'plain'
  readonly diagramMode: 'svg-if-compatible' | 'png'
  readonly mathMode: 'image' | 'text-fallback'
}

export type ExportOptions = HtmlExportOptions | PdfExportOptions | DocxExportOptions

export interface ExportSnapshotRequestBase {
  readonly documentId: string
  readonly revision: number
  readonly markdown: string
  readonly title: string
  readonly textFormat: TextFormatMetadata
  readonly resourceScopeId?: string
}

export interface StartHtmlExportRequest extends ExportSnapshotRequestBase {
  readonly format: 'html'
  readonly options: HtmlExportOptions
  readonly targetSelectionToken: string
}

export interface StartPdfExportRequest extends ExportSnapshotRequestBase {
  readonly format: 'pdf'
  readonly options: PdfExportOptions
  readonly targetSelectionToken: string
}

export interface StartDocxExportRequest extends ExportSnapshotRequestBase {
  readonly format: 'docx'
  readonly options: DocxExportOptions
  readonly targetSelectionToken: string
}

export type StartExportRequest = StartHtmlExportRequest | StartPdfExportRequest | StartDocxExportRequest

export interface PrintRequest extends ExportSnapshotRequestBase {
  readonly options: PdfExportOptions
}

export interface ExportProgress {
  readonly phase: 'preparing' | 'assets' | 'rendering' | 'packaging' | 'writing' | 'finishing'
  readonly completed?: number
  readonly total?: number
  readonly percent?: number
  readonly messageKey?: string
}

export interface ExportJobDTO {
  readonly jobId: string
  readonly documentId: string
  readonly sourceRevision: number
  readonly status: ExportStatus
  readonly format: ExportJobKind
  readonly startedAt: string
  readonly completedAt?: string
  readonly targetDisplayPath?: string
  readonly progress?: ExportProgress
  readonly correlationId: string
  readonly errorCode?: string
  readonly diagnosticCodes?: readonly string[]
}

export interface ExportProgressEvent {
  readonly jobId: string
  readonly documentId: string
  readonly sourceRevision: number
  readonly format: ExportJobKind
  readonly status: ExportStatus
  readonly progress: ExportProgress
}

export interface ExportCompletedEvent {
  readonly jobId: string
  readonly documentId: string
  readonly sourceRevision: number
  readonly format: ExportJobKind
  readonly success: boolean
  readonly cancelled: boolean
  readonly correlationId: string
  readonly displayPath?: string
  readonly errorCode?: string
  readonly diagnosticCodes?: readonly string[]
}
