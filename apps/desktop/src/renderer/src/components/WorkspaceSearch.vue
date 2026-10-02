<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { OpenDocumentDTO, SearchMatch } from '@markhere/ipc-contract'
import { useWorkspaceStore } from '../workspace-store'

const props = defineProps<{ workspaceId: string }>()
const emit = defineEmits<{ openedDocument: [document: OpenDocumentDTO, anchor?: string]; error: [code: string] }>()
const store = useWorkspaceStore()
const query = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const filePattern = ref('')
const unsubscribers: Array<() => void> = []

async function search(): Promise<void> {
  const value = query.value.trim()
  if (!value) return
  if (store.searchId && store.searchState === 'searching') window.markhere.workspaces.cancelSearch(store.searchId)
  const result = await window.markhere.workspaces.search({
    workspaceId: props.workspaceId,
    query: value,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    ...(filePattern.value.trim() ? { filePattern: filePattern.value.trim() } : {}),
    maxResults: 1000
  })
  if (!result.ok) { emit('error', result.error.code); return }
  store.beginSearch(result.data.searchId)
}

function cancel(): void {
  if (store.searchId) window.markhere.workspaces.cancelSearch(store.searchId)
}

async function openResult(match: SearchMatch): Promise<void> {
  const opened = await window.markhere.workspaces.openEntry({ workspaceId: props.workspaceId, relativePath: match.relativePath })
  if (!opened.ok) { emit('error', opened.error.code); return }
  emit('openedDocument', opened.data, `@line:${match.line}`)
}

onMounted(() => {
  unsubscribers.push(window.markhere.events.onWorkspaceSearchBatch((event) => {
    if (event.workspaceId !== props.workspaceId || event.searchId !== store.searchId) return
    store.searchResults.push(...event.matches)
  }))
  unsubscribers.push(window.markhere.events.onWorkspaceSearchCompleted((event) => {
    if (event.workspaceId !== props.workspaceId || event.searchId !== store.searchId) return
    store.searchState = event.status
    store.searchTruncated = event.truncated
    if (event.status === 'failed' && event.errorCode) emit('error', event.errorCode)
  }))
})
onBeforeUnmount(() => { for (const unsubscribe of unsubscribers) unsubscribe(); cancel() })
</script>

<template>
  <section class="workspace-search" aria-label="Search workspace">
    <form class="search-form" @submit.prevent="search">
      <label class="query">Search <input v-model="query" type="search" autocomplete="off"></label>
      <label>Files <input v-model="filePattern" placeholder="*.md" autocomplete="off"></label>
      <div class="options">
        <label><input v-model="caseSensitive" type="checkbox"> Case</label>
        <label><input v-model="wholeWord" type="checkbox"> Whole word</label>
      </div>
      <div class="buttons"><button type="submit">Search</button><button type="button" :disabled="store.searchState !== 'searching'" @click="cancel">Cancel</button></div>
    </form>
    <p class="summary" aria-live="polite">{{ store.searchState }} · {{ store.searchResults.length }} matches<span v-if="store.searchTruncated"> · result limit reached</span></p>
    <div class="results" role="list">
      <button v-for="(match, index) in store.searchResults" :key="`${match.relativePath}:${match.line}:${match.column}:${index}`" type="button" class="result" role="listitem" @click="openResult(match)">
        <strong>{{ match.relativePath }}</strong><span>Ln {{ match.line }}, Col {{ match.column }}</span><code>{{ match.preview }}</code>
      </button>
    </div>
  </section>
</template>

<style scoped>
.workspace-search { min-height: 0; display: flex; flex: 1; flex-direction: column; }
.search-form { display: grid; gap: 7px; padding: 9px; border-bottom: 1px solid var(--mh-border); }
.search-form label { display: grid; gap: 3px; font-size: 11px; color: var(--mh-muted); }
.options { display: flex; gap: 12px; }.options label { display: flex; flex-direction: row; align-items: center; }
.buttons { display: flex; gap: 6px; }.summary { margin: 0; padding: 7px 9px; color: var(--mh-muted); font-size: 11px; border-bottom: 1px solid var(--mh-border); }
.results { min-height: 0; flex: 1; overflow: auto; }.result { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px 9px; border: 0; border-bottom: 1px solid var(--mh-border); border-radius: 0; background: transparent; color: var(--mh-text); text-align: left; }
.result:hover { background: var(--mh-hover); }.result span { color: var(--mh-muted); font-size: 10px; }.result code { grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--mh-muted); }
</style>
