<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { CommandId, KeybindingConfig } from '@markhere/ipc-contract'
import { RENDERER_COMMANDS } from '../command-catalog'
import { presentShortcut } from '../keyboard-shortcuts'

const props = defineProps<{ open: boolean; hasDocument: boolean; editable: boolean; keybindings: KeybindingConfig; platform: string }>()
const emit = defineEmits<{ close: []; execute: [id: CommandId] }>()
const query = ref('')
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const commands = computed(() => RENDERER_COMMANDS.filter((item) => (!item.requiresDocument || props.hasDocument) && (!item.requiresEditable || props.editable)))
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('en-US')
  return needle ? commands.value.filter((item) => `${item.label} ${item.id}`.toLocaleLowerCase('en-US').includes(needle)) : commands.value
})

watch(() => props.open, async (open) => { if (open) { query.value = ''; selected.value = 0; await nextTick(); input.value?.focus() } })
watch(filtered, () => { selected.value = Math.min(selected.value, Math.max(0, filtered.value.length - 1)) })
function run(id: CommandId): void { emit('execute', id); emit('close') }
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); selected.value = Math.min(filtered.value.length - 1, selected.value + 1); return }
  if (event.key === 'ArrowUp') { event.preventDefault(); selected.value = Math.max(0, selected.value - 1); return }
  if (event.key === 'Enter' && filtered.value[selected.value]) { event.preventDefault(); run(filtered.value[selected.value]!.id) }
}
</script>

<template>
  <div v-if="open" class="scrim" @mousedown.self="emit('close')">
    <section class="palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" @keydown="onKeydown">
      <h2 id="command-palette-title">Command palette</h2>
      <input ref="input" v-model="query" type="search" aria-label="Search commands" placeholder="Type a command…" autocomplete="off">
      <div class="commands" role="listbox" aria-label="Commands">
        <button v-for="(command, index) in filtered" :key="command.id" type="button" role="option" :aria-selected="index === selected" :class="{ selected: index === selected }" @mousemove="selected = index" @click="run(command.id)">
          <span>{{ command.label }}</span><kbd v-if="keybindings.bindings[command.id]">{{ presentShortcut(keybindings.bindings[command.id] ?? '', platform) }}</kbd>
        </button>
        <p v-if="filtered.length === 0">No matching commands.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 100; display: grid; place-items: start center; padding-top: 12vh; background: rgb(0 0 0 / .36); }
.palette { width: min(620px, calc(100vw - 32px)); max-height: 70vh; display: grid; gap: 10px; padding: 14px; overflow: hidden; border: 1px solid var(--mh-border); border-radius: 10px; background: var(--mh-panel); color: var(--mh-text); box-shadow: 0 18px 50px rgb(0 0 0 / .28); }
h2 { margin: 0; font-size: 15px; }.commands { overflow: auto; }.commands button { width: 100%; display: flex; justify-content: space-between; gap: 16px; padding: 9px 10px; border: 0; background: transparent; color: inherit; text-align: left; }.commands button.selected { background: var(--mh-selected); }.commands p { color: var(--mh-muted); }
kbd { color: var(--mh-muted); font-family: inherit; }
</style>
