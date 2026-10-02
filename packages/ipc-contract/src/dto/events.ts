import type { ExportCompletedEvent, ExportProgressEvent } from './export'
import type { UpdateStatus } from './update'
import type { AppCommandEvent, WindowStateEvent } from './common'
import type { FileFingerprint } from './files'
import type { KeybindingConfig, MarkHereSettings } from './settings'
import type { WorkspaceSearchBatchEvent, WorkspaceSearchCompletedEvent } from './workspace'

export interface DocumentExternalChangeEvent {
  readonly documentId: string
  readonly kind: 'changed' | 'deleted' | 'renamed'
  readonly actualFingerprint?: FileFingerprint | null
  readonly detectedAt?: string
}

export interface WorkspaceChangeEvent {
  readonly workspaceId: string
  readonly kind: 'added' | 'changed' | 'removed'
  readonly relativePath: string
}

export interface SettingsChangedEvent {
  readonly settings: MarkHereSettings
}

export interface KeybindingsChangedEvent {
  readonly config: KeybindingConfig
}

export type {
  AppCommandEvent,
  ExportCompletedEvent,
  ExportProgressEvent,
  KeybindingConfig,
  MarkHereSettings,
  UpdateStatus,
  WindowStateEvent,
  WorkspaceSearchBatchEvent,
  WorkspaceSearchCompletedEvent
}
