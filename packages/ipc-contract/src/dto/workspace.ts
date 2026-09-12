export interface WorkspaceDTO {
  readonly workspaceId: string
  readonly displayPath: string
  readonly basename: string
}

export interface ListWorkspaceRequest {
  readonly workspaceId: string
  readonly relativePath?: string
}

export interface WorkspaceEntry {
  readonly name: string
  readonly relativePath: string
  readonly kind: 'file' | 'directory'
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
  readonly filePattern?: string
}
