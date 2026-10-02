<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspaceEntry } from '@markhere/ipc-contract'

const props = defineProps<{ entry: WorkspaceEntry; depth: number; expanded: boolean; selected: boolean }>()
const emit = defineEmits<{ toggle: [entry: WorkspaceEntry]; open: [entry: WorkspaceEntry]; select: [entry: WorkspaceEntry] }>()
const marker = computed(() => props.entry.kind === 'directory' ? (props.expanded ? '▾' : '▸') : props.entry.markdown ? 'M' : '·')
</script>

<template>
  <button
    class="tree-row"
    type="button"
    role="treeitem"
    :aria-level="depth + 1"
    :aria-expanded="entry.kind === 'directory' ? expanded : undefined"
    :aria-selected="selected"
    :class="{ selected }"
    :style="{ paddingInlineStart: `${8 + depth * 16}px` }"
    @click="emit('select', entry)"
    @dblclick="entry.kind === 'directory' ? emit('toggle', entry) : emit('open', entry)"
    @keydown.enter="entry.kind === 'directory' ? emit('toggle', entry) : emit('open', entry)"
    @keydown.space.prevent="entry.kind === 'directory' ? emit('toggle', entry) : emit('open', entry)"
  >
    <span class="marker" aria-hidden="true">{{ marker }}</span>
    <span class="name">{{ entry.name }}</span>
    <span v-if="entry.kind === 'symlink'" class="badge">link</span>
  </button>
</template>

<style scoped>
.tree-row { width: 100%; display: flex; align-items: center; gap: 7px; border: 0; border-radius: 4px; padding-block: 5px; padding-right: 8px; background: transparent; color: var(--mh-text); text-align: left; font: inherit; }
.tree-row:hover { background: var(--mh-hover); }
.tree-row.selected { background: var(--mh-selected); }
.marker { width: 14px; flex: 0 0 14px; color: var(--mh-muted); font-size: 11px; text-align: center; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { margin-left: auto; font-size: 10px; color: var(--mh-muted); }
</style>
