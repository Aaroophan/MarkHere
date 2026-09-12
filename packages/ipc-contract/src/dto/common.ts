export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ErrorDTO }

export type ErrorCategory =
  | 'validation'
  | 'filesystem'
  | 'conflict'
  | 'security'
  | 'export'
  | 'update'
  | 'cancelled'
  | 'internal'

export interface ErrorDTO {
  readonly code: string
  readonly category: ErrorCategory
  readonly messageKey: string
  readonly recoverable: boolean
  readonly correlationId: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
}

export interface SelectedPath {
  readonly displayPath: string
  readonly selectionToken: string
}

export type Unsubscribe = () => void

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'files'
  | 'export'
  | 'keybindings'
  | 'updates'

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.openFolder'
  | 'file.save'
  | 'file.saveAs'
  | 'file.export.html'
  | 'file.export.pdf'
  | 'file.export.docx'
  | 'view.mode.preview'
  | 'view.mode.wysiwyg'
  | 'view.mode.source'
  | 'view.mode.split'
  | 'edit.find'
  | 'edit.replace'
  | 'app.settings'
  | 'app.quit'

export interface AppCommandEvent {
  readonly id: CommandId
  readonly source: 'menu' | 'shortcut' | 'system'
}

export interface WindowStateEvent {
  readonly maximized: boolean
  readonly fullScreen: boolean
  readonly alwaysOnTop: boolean
}
