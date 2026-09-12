export type ExportFormat = 'html' | 'pdf' | 'docx'

export interface HtmlExportOptions {
  readonly theme?: string
}

export interface PdfExportOptions {
  readonly pageSize?: 'A4' | 'Letter' | 'Legal'
  readonly landscape?: boolean
  readonly marginMm?: number
}

export interface DocxExportOptions {
  readonly includeTitle?: boolean
  readonly includeTableOfContents?: boolean
}

export interface StartExportRequest {
  readonly documentId: string
  readonly revision: number
  readonly markdown: string
  readonly format: ExportFormat
  readonly options: HtmlExportOptions | PdfExportOptions | DocxExportOptions
  readonly targetSelectionToken: string
}

export interface ExportJobDTO {
  readonly jobId: string
  readonly status: 'queued' | 'preparing' | 'rendering' | 'writing' | 'completed' | 'failed' | 'cancelled'
  readonly format: ExportFormat
  readonly percent?: number
  readonly errorCode?: string
}

export interface ExportProgressEvent {
  readonly jobId: string
  readonly phase: 'preparing' | 'assets' | 'rendering' | 'packaging' | 'writing'
  readonly completed?: number
  readonly total?: number
  readonly percent?: number
}

export interface ExportCompletedEvent {
  readonly jobId: string
  readonly success: boolean
  readonly displayPath?: string
  readonly errorCode?: string
}
