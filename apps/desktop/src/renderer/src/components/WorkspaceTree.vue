<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OpenDocumentDTO, WorkspaceEntry } from '@markhere/ipc-contract'
import { useWorkspaceStore } from '../workspace-store'
import WorkspaceTreeNode from './WorkspaceTreeNode.vue'

const props = defineProps<{ workspaceId: string }>()
const emit = defineEmits<{ openedDocument: [document: OpenDocumentDTO]; error: [code: string] }>()
const store = useWorkspaceStore()
const operation = ref<'file' | 'directory' | 'rename' | 'move' | null>(null)
const operationValue = ref('')
const busy = ref(false)
let unsubscribe: (() => void) | null = null

const flatRows = computed(() => {
  const output: Array<{ entry: WorkspaceEntry; depth: number }> = []
  const walk = (directory: string, depth: number): void => {
    for (const entry of store.entriesByDirectory[directory] ?? []) {
      output.push({ entry, depth })
      if (entry.kind === 'directory' && store.expanded.includes(entry.relativePath)) walk(entry.relativePath, depth + 1)
    }
  }
  walk('', 0)
  return output
})

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

async function load(relativePath = ''): Promise<void> {
  const result = await window.markhere.workspaces.list({ workspaceId: props.workspaceId, ...(relativePath ? { relativePath } : {}) })
  if (!result.ok) { emit('error', result.error.code); return }
  store.setEntries(relativePath, [...result.data])
}

async function toggle(entry: WorkspaceEntry): Promise<void> {
  if (entry.kind !== 'directory') return
  const next = !store.expanded.includes(entry.relativePath)
  store.setExpanded(entry.relativePath, next)
  if (next) await load(entry.relativePath)
}

async function open(entry: WorkspaceEntry): Promise<void> {
  if (entry.kind !== 'file') return
  const result = await window.markhere.workspaces.openEntry({ workspaceId: props.workspaceId, relativePath: entry.relativePath })
  if (!result.ok) { emit('error', result.error.code); return }
  emit('openedDocument', result.data)
}

function select(entry: WorkspaceEntry): void { store.selectedPath = entry.relativePath }

function begin(next: typeof operation.value): void {
  operation.value = next
  const selected = store.selectedPath
  operationValue.value = next === 'rename' && selected ? selected.split('/').pop() ?? '' : next === 'move' && selected ? selected : ''
}

async function applyOperation(): Promise<void> {
  const workspaceId = props.workspaceId
  const selected = store.selectedPath
  const value = operationValue.value.trim().replace(/\\/g, '/')
  if (!operation.value || !value) return
  busy.value = true
  try {
    let result
    if (operation.value === 'file') result = await window.markhere.workspaces.createFile({ workspaceId, relativePath: value })
    else if (operation.value === 'directory') result = await window.markhere.workspaces.createDirectory({ workspaceId, relativePath: value })
    else if (operation.value === 'rename' && selected) result = await window.markhere.workspaces.rename({ workspaceId, relativePath: selected, newName: value })
    else if (operation.value === 'move' && selected) result = await window.markhere.workspaces.move({ workspaceId, relativePath: selected, targetRelativePath: value })
    if (result && !result.ok) emit('error', result.error.code)
    else {
      operation.value = null
      operationValue.value = ''
      await load(selected ? parentPath(selected) : '')
      await load('')
    }
  } finally { busy.value = false }
}

async function trashSelected(): Promise<void> {
  const relativePath = store.selectedPath
  if (!relativePath) return
  const result = await window.markhere.workspaces.trash({ workspaceId: props.workspaceId, relativePath })
  if (!result.ok) emit('error', result.error.code)
  else { store.selectedPath = null; await load(parentPath(relativePath)); await load('') }
}

async function refreshForChange(relativePath: string): Promise<void> {
  const parent = parentPath(relativePath)
  await load(parent)
  if (parent) await load('')
}

watch(() => props.workspaceId, async () => { store.entriesByDirectory = {}; store.expanded = []; await load('') })

onMounted(async () => {
  await load('')
  unsubscribe = window.markhere.events.onWorkspaceChange((event) => {
    if (event.workspaceId === props.workspaceId) void refreshForChange(event.relativePath)
  })
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <section class="workspace-tree" aria-label="Workspace files">
    <div class="tree-actions" role="toolbar" aria-label="Workspace file actions">
      <button type="button" title="New file" aria-label="New file" @click="begin('file')">＋F</button>
      <button type="button" title="New folder" aria-label="New folder" @click="begin('directory')">＋D</button>
      <button type="button" title="Rename selected" aria-label="Rename selected" :disabled="!store.selectedPath" @click="begin('rename')">R</button>
      <button type="button" title="Move selected" aria-label="Move selected" :disabled="!store.selectedPath" @click="begin('move')">M</button>
      <button type="button" title="Move selected item to trash" aria-label="Trash selected" :disabled="!store.selectedPath" @click="trashSelected">⌫</button>
    </div>
    <form v-if="operation" class="operation" @submit.prevent="applyOperation">
      <label>
        <span>{{ operation === 'file' ? 'New file path' : operation === 'directory' ? 'New folder path' : operation === 'rename' ? 'New name' : 'Move to path' }}</span>
        <input v-model="operationValue" autofocus autocomplete="off">
      </label>
      <button type="submit" :disabled="busy">Apply</button>
      <button type="button" @click="operation = null">Cancel</button>
    </form>
    <div class="tree" role="tree" aria-label="Workspace file tree">
      <WorkspaceTreeNode
        v-for="row in flatRows"
        :key="row.entry.id"
        :entry="row.entry"
        :depth="row.depth"
        :expanded="store.expanded.includes(row.entry.relativePath)"
        :selected="store.selectedPath === row.entry.relativePath"
        @toggle="toggle"
        @open="open"
        @select="select"
      />
      <p v-if="flatRows.length === 0" class="empty">This folder is empty.</p>
    </div>
  </section>
</template>

<style scoped>
.workspace-tree { min-height: 0; display: flex; flex: 1; flex-direction: column; }
.tree-actions { display: flex; gap: 4px; padding: 7px; border-bottom: 1px solid var(--mh-border); }
.tree-actions button { min-width: 30px; }
.operation { display: grid; grid-template-columns: 1fr auto auto; gap: 5px; align-items: end; padding: 7px; border-bottom: 1px solid var(--mh-border); }
.operation label { display: grid; gap: 3px; min-width: 0; font-size: 11px; color: var(--mh-muted); }
.operation input { width: 100%; }
.tree { min-height: 0; flex: 1; overflow: auto; padding: 4px; }
.empty { color: var(--mh-muted); font-size: 12px; padding: 8px; }
</style>
