import { defineStore } from 'pinia'
import type { SearchMatch, WorkspaceDTO, WorkspaceEntry } from '@markhere/ipc-contract'

interface WorkspaceState {
  workspace: WorkspaceDTO | null
  entriesByDirectory: Record<string, WorkspaceEntry[]>
  expanded: string[]
  selectedPath: string | null
  searchId: string | null
  searchResults: SearchMatch[]
  searchState: 'idle' | 'searching' | 'completed' | 'cancelled' | 'failed'
  searchTruncated: boolean
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    workspace: null,
    entriesByDirectory: {},
    expanded: [],
    selectedPath: null,
    searchId: null,
    searchResults: [],
    searchState: 'idle',
    searchTruncated: false
  }),
  actions: {
    setWorkspace(workspace: WorkspaceDTO | null): void {
      this.workspace = workspace
      this.entriesByDirectory = {}
      this.expanded = []
      this.selectedPath = null
      this.searchId = null
      this.searchResults = []
      this.searchState = 'idle'
      this.searchTruncated = false
    },
    setEntries(relativePath: string, entries: WorkspaceEntry[]): void { this.entriesByDirectory[relativePath] = entries },
    setExpanded(relativePath: string, expanded: boolean): void {
      const set = new Set(this.expanded)
      if (expanded) set.add(relativePath); else set.delete(relativePath)
      this.expanded = [...set]
    },
    beginSearch(searchId: string): void {
      this.searchId = searchId
      this.searchResults = []
      this.searchState = 'searching'
      this.searchTruncated = false
    }
  }
})
