export interface OpenDocumentDialogOptions {
  readonly allowMultiple?: boolean
}

export interface ExportTargetDialogRequest {
  readonly format: 'html' | 'pdf' | 'docx'
  readonly defaultName?: string
}

export interface ConfirmDialogRequest {
  readonly title: string
  readonly message: string
  readonly detail?: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
}

export interface ConfirmDialogResult {
  readonly confirmed: boolean
}
