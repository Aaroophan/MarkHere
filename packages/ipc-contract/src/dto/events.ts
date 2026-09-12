import type { ExportCompletedEvent, ExportProgressEvent } from './export'
import type { UpdateStatus } from './update'
import type { AppCommandEvent, WindowStateEvent } from './common'

export interface DocumentExternalChangeEvent {
  readonly documentId: string
  readonly kind: 'changed' | 'deleted' | 'renamed'
}

export interface WorkspaceChangeEvent {
  readonly workspaceId: string
  readonly kind: 'added' | 'changed' | 'removed'
  readonly relativePath: string
}

export type {
  AppCommandEvent,
  ExportCompletedEvent,
  ExportProgressEvent,
  UpdateStatus,
  WindowStateEvent
}
