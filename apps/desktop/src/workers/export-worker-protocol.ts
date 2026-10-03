import type {
  DocxExportOptions,
  ExportAsset,
  ExportDocument,
  ExportResultDiagnostic,
  HtmlExportOptions,
  PdfExportOptions
} from '@markhere/export-core'

export type ExportWorkerRequest =
  | {
      readonly type: 'render-html'
      readonly requestId: string
      readonly document: ExportDocument
      readonly assets: readonly ExportAsset[]
      readonly options: HtmlExportOptions
    }
  | {
      readonly type: 'render-print-html'
      readonly requestId: string
      readonly document: ExportDocument
      readonly assets: readonly ExportAsset[]
      readonly options: PdfExportOptions
    }
  | {
      readonly type: 'render-docx'
      readonly requestId: string
      readonly document: ExportDocument
      readonly assets: readonly ExportAsset[]
      readonly options: DocxExportOptions
    }

export type ExportWorkerResponse =
  | {
      readonly type: 'result'
      readonly requestId: string
      readonly html?: string
      readonly bytes?: Uint8Array
      readonly diagnostics: readonly ExportResultDiagnostic[]
    }
  | {
      readonly type: 'error'
      readonly requestId: string
      readonly code: string
      readonly message: string
    }
