import type { Brand } from '@markhere/shared'

export type DocumentId = Brand<string, 'DocumentId'>
export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type ExportJobId = Brand<string, 'ExportJobId'>
export type CapabilityId = Brand<string, 'CapabilityId'>
export type DocumentRevision = Brand<number, 'DocumentRevision'>

export type DocumentMode = 'preview' | 'wysiwyg' | 'source' | 'split'
