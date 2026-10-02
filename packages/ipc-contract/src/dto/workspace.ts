export interface WorkspaceDTO {
  readonly workspaceId: string
  readonly displayPath: string
  readonly basename: string
}

export interface RecentItemDTO {
  readonly id: string
  readonly kind: 'file' | 'workspace'
  readonly displayPath: string
  readonly basename: string
  readonly lastOpenedAt: string
}

export interface ListWorkspaceRequest {
  readonly workspaceId: string
  readonly relativePath?: string
}

export interface WorkspaceEntry {
  readonly id: string
  readonly name: string
  readonly relativePath: string
  readonly kind: 'file' | 'directory' | 'symlink' | 'other'
  readonly markdown: boolean
  readonly childrenLoaded: boolean
}

export interface CreateWorkspaceFileRequest {
  readonly workspaceId: string
  readonly relativePath: string
}

export interface CreateWorkspaceDirectoryRequest {
  readonly workspaceId: string
  readonly relativePath: string
}

export interface RenameWorkspaceEntryRequest {
  readonly workspaceId: string
  readonly relativePath: string
  readonly newName: string
}

export interface MoveWorkspaceEntryRequest {
  readonly workspaceId: string
  readonly relativePath: string
  readonly targetRelativePath: string
}

export interface TrashWorkspaceEntryRequest {
  readonly workspaceId: string
  readonly relativePath: string
}

export interface OpenWorkspaceEntryRequest {
  readonly workspaceId: string
  readonly relativePath: string
}

export interface SearchRequest {
  readonly workspaceId: string
  readonly query: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly regex?: boolean
  readonly filePattern?: string
  readonly includeGlobs?: readonly string[]
  readonly excludeGlobs?: readonly string[]
  readonly maxResults?: number
}

export interface SearchMatch {
  readonly relativePath: string
  readonly line: number
  readonly column: number
  readonly preview: string
  readonly ranges: ReadonlyArray<{ readonly start: number; readonly end: number }>
}

export interface WorkspaceSearchBatchEvent {
  readonly workspaceId: string
  readonly searchId: string
  readonly matches: readonly SearchMatch[]
}

export interface WorkspaceSearchCompletedEvent {
  readonly workspaceId: string
  readonly searchId: string
  readonly status: 'completed' | 'cancelled' | 'failed'
  readonly resultCount: number
  readonly truncated: boolean
  readonly errorCode?: string
}
