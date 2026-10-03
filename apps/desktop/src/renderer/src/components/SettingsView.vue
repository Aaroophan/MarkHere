<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { KeybindingConfig, MarkHereSettings, SettingsPatch, SettingsSection } from '@markhere/ipc-contract'
import { RENDERER_COMMANDS } from '../command-catalog'
import { presentShortcut } from '../keyboard-shortcuts'

const props = defineProps<{ initialSettings: MarkHereSettings; initialKeybindings: KeybindingConfig; platform: string }>()
const emit = defineEmits<{ settingsChanged: [settings: MarkHereSettings]; keybindingsChanged: [config: KeybindingConfig] }>()
const settings = ref<MarkHereSettings>(props.initialSettings)
const keybindings = ref<KeybindingConfig>(props.initialKeybindings)
const error = ref<string | null>(null)
const saving = ref(false)
const unsubscribers: Array<() => void> = []
const bindingDraft = ref<Record<string, string>>({ ...props.initialKeybindings.bindings })
const sections: readonly SettingsSection[] = ['general', 'appearance', 'editor', 'files', 'keybindings']
const activeSection = ref<SettingsSection>('general')
const commands = computed(() => RENDERER_COMMANDS.filter((command) => command.id !== 'app.quit'))

watch(() => props.initialSettings, (value) => { settings.value = value })
watch(() => props.initialKeybindings, (value) => { keybindings.value = value; bindingDraft.value = { ...value.bindings } })

async function patch(changes: Omit<SettingsPatch, 'expectedRevision'>): Promise<void> {
  saving.value = true; error.value = null
  try {
    const result = await window.markhere.settings.update({ ...changes, expectedRevision: settings.value.revision })
    if (!result.ok) { error.value = result.error.code; return }
    settings.value = result.data
    emit('settingsChanged', result.data)
  } finally { saving.value = false }
}

async function reset(section: SettingsSection): Promise<void> {
  const result = await window.markhere.settings.reset(section)
  if (!result.ok) { error.value = result.error.code; return }
  settings.value = result.data
  emit('settingsChanged', result.data)
}

async function saveKeybindings(): Promise<void> {
  error.value = null
  const result = await window.markhere.settings.updateKeybindings({ revision: keybindings.value.revision, bindings: bindingDraft.value })
  if (!result.ok) { error.value = result.error.code; return }
  keybindings.value = result.data
  bindingDraft.value = { ...result.data.bindings }
  emit('keybindingsChanged', result.data)
}

async function resetKeybindings(): Promise<void> {
  const result = await window.markhere.settings.updateKeybindings({ revision: keybindings.value.revision, bindings: {} })
  if (!result.ok) { error.value = result.error.code; return }
  keybindings.value = result.data
  bindingDraft.value = { ...result.data.bindings }
  emit('keybindingsChanged', result.data)
}

function updateSelect(event: Event, key: 'appearance' | 'defaultMode' | 'remoteResources' | 'imageStorage'): void {
  const target = event.target as HTMLSelectElement
  void patch({ [key]: target.value } as Omit<SettingsPatch, 'expectedRevision'>)
}
function updateCheckbox(event: Event, key: 'autosave' | 'lineNumbers' | 'syncScroll'): void {
  void patch({ [key]: (event.target as HTMLInputElement).checked } as Omit<SettingsPatch, 'expectedRevision'>)
}
function updateNumber(event: Event, key: 'autosaveDelayMs'): void {
  void patch({ [key]: Number((event.target as HTMLInputElement).value) } as Omit<SettingsPatch, 'expectedRevision'>)
}

async function createDiagnostics(): Promise<void> {
  const result = await window.markhere.diagnostics.createBundle()
  error.value = result.ok ? null : result.error.code
}
async function openLogs(): Promise<void> { const result = await window.markhere.diagnostics.openLogsFolder(); if (!result.ok) error.value = result.error.code }
async function clearLogs(): Promise<void> { const result = await window.markhere.diagnostics.clearLogs(); if (!result.ok) error.value = result.error.code }

onMounted(() => {
  unsubscribers.push(window.markhere.events.onSettingsChanged((event) => { settings.value = event.settings }))
  unsubscribers.push(window.markhere.events.onKeybindingsChanged((event) => { keybindings.value = event.config; bindingDraft.value = { ...event.config.bindings } }))
})
onBeforeUnmount(() => { for (const unsubscribe of unsubscribers) unsubscribe() })
</script>

<template>
  <main class="settings-view">
    <header><div><h1>MarkHere Settings</h1><p>Preferences are stored locally and validated by the privileged application layer.</p></div><button type="button" @click="window.markhere.window.close()">Close</button></header>
    <div class="layout">
      <nav aria-label="Settings sections">
        <button v-for="section in sections" :key="section" type="button" :class="{ active: activeSection === section }" @click="activeSection = section">{{ section }}</button>
      </nav>
      <section class="content">
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <fieldset v-if="activeSection === 'general'">
          <legend>General</legend>
          <label>Default mode
            <select :value="settings.defaultMode" @change="updateSelect($event, 'defaultMode')"><option value="preview">Preview</option><option value="wysiwyg">WYSIWYG</option><option value="source">Source</option><option value="split">Split</option></select>
          </label>
          <button type="button" @click="reset('general')">Reset general settings</button>
          <div class="diagnostics-actions"><strong>Local diagnostics</strong><p>Diagnostic bundles are created only on request and exclude document/recovery bodies.</p><div class="row"><button type="button" @click="createDiagnostics">Create diagnostic bundle</button><button type="button" @click="openLogs">Open logs folder</button><button type="button" @click="clearLogs">Clear logs</button></div></div>
        </fieldset>
        <fieldset v-else-if="activeSection === 'appearance'">
          <legend>Appearance</legend>
          <label>Theme
            <select :value="settings.appearance" @change="updateSelect($event, 'appearance')"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
          </label>
          <p>System follows the operating-system appearance.</p>
          <button type="button" @click="reset('appearance')">Reset appearance</button>
        </fieldset>
        <fieldset v-else-if="activeSection === 'editor'">
          <legend>Editor</legend>
          <label class="check"><input type="checkbox" :checked="settings.lineNumbers" @change="updateCheckbox($event, 'lineNumbers')"> Show source line numbers</label>
          <label class="check"><input type="checkbox" :checked="settings.syncScroll" @change="updateCheckbox($event, 'syncScroll')"> Synchronize Source/Preview scroll in Split mode</label>
          <button type="button" @click="reset('editor')">Reset editor settings</button>
        </fieldset>
        <fieldset v-else-if="activeSection === 'files'">
          <legend>Files and resources</legend>
          <label class="check"><input type="checkbox" :checked="settings.autosave" @change="updateCheckbox($event, 'autosave')"> Autosave dirty file-backed documents</label>
          <label>Autosave delay (milliseconds)<input type="number" min="500" max="60000" step="250" :value="settings.autosaveDelayMs" @change="updateNumber($event, 'autosaveDelayMs')"></label>
          <label>Remote HTTPS images
            <select :value="settings.remoteResources" @change="updateSelect($event, 'remoteResources')"><option value="block">Block</option><option value="ask">Ask before loading</option><option value="allow-https">Allow HTTPS</option></select>
          </label>
          <label>Pasted/dropped images
            <select :value="settings.imageStorage" @change="updateSelect($event, 'imageStorage')"><option value="beside-document">Copy to assets beside document</option><option value="data-uri">Embed as data URI</option></select>
          </label>
          <button type="button" @click="reset('files')">Reset file settings</button>
        </fieldset>
        <fieldset v-else-if="activeSection === 'keybindings'">
          <legend>Keyboard shortcuts</legend>
          <p>Use Electron-style shortcuts such as <code>CmdOrCtrl+Shift+P</code>. Duplicate shortcuts are rejected.</p>
          <div class="bindings">
            <label v-for="command in commands" :key="command.id"><span>{{ command.label }}</span><input v-model="bindingDraft[command.id]" :placeholder="presentShortcut(keybindings.bindings[command.id] ?? '', platform)"></label>
          </div>
          <div class="row"><button type="button" @click="saveKeybindings">Save shortcuts</button><button type="button" @click="resetKeybindings">Reset shortcuts</button></div>
        </fieldset>
        <p v-if="saving" aria-live="polite">Saving…</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-view { min-height: 100vh; background: var(--mh-bg); color: var(--mh-text); }
header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 24px; border-bottom: 1px solid var(--mh-border); }h1 { margin: 0 0 4px; font-size: 22px; }header p { margin: 0; color: var(--mh-muted); }
.layout { display: grid; grid-template-columns: 190px 1fr; min-height: calc(100vh - 86px); }nav { display: grid; align-content: start; gap: 4px; padding: 12px; border-right: 1px solid var(--mh-border); }nav button { text-align: left; text-transform: capitalize; background: transparent; border-color: transparent; }nav button.active { background: var(--mh-selected); border-color: var(--mh-border); }
.content { max-width: 760px; padding: 24px; }.content fieldset { display: grid; gap: 16px; border: 0; padding: 0; }.content legend { margin-bottom: 14px; font-size: 18px; font-weight: 650; }.content label:not(.check) { display: grid; gap: 6px; }.check { display: flex; gap: 8px; align-items: center; }.content select,.content input { max-width: 420px; }.bindings { display: grid; gap: 8px; }.bindings label { grid-template-columns: 1fr minmax(200px, .8fr); align-items: center; }.row { display: flex; gap: 8px; flex-wrap: wrap; }.diagnostics-actions { display: grid; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--mh-border); }.diagnostics-actions p { margin: 0; color: var(--mh-muted); }.error { padding: 8px 10px; border: 1px solid var(--mh-danger); border-radius: 6px; color: var(--mh-danger); }
@media (max-width: 700px) { .layout { grid-template-columns: 1fr; } nav { display: flex; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--mh-border); } }
</style>
