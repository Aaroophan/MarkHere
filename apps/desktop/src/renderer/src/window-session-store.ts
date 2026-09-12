import { defineStore } from 'pinia'

/**
 * Per-renderer-window shell state only. Canonical document text/revisions are
 * introduced by Issue 3 and must not be duplicated into this UI store.
 * Because every BrowserWindow owns a separate renderer/Pinia instance, editor
 * windows cannot accidentally share mutable tab/workspace/layout state.
 */
export const useWindowSessionStore = defineStore('window-session', {
  state: () => ({
    tabIds: [] as string[],
    activeDocumentId: null as string | null,
    workspaceId: null as string | null,
    layout: {
      sidebarVisible: true,
      sidebarWidth: 280,
      statusBarVisible: true
    }
  })
})
