<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppInfo, AppCommandEvent, WindowStateEvent } from '@markhere/ipc-contract'
import { RendererCommandRegistry } from './command-registry'
import { useWindowSessionStore } from './window-session-store'

const appInfo = ref<AppInfo | null>(null)
const errorCode = ref<string | null>(null)
const lastCommand = ref<string>('none')
const windowState = ref<WindowStateEvent>({ maximized: false, fullScreen: false, alwaysOnTop: false })
const commandRegistry = new RendererCommandRegistry()
const windowSession = useWindowSessionStore()
const unsubscribers: Array<() => void> = []

const surface = computed(() => new URLSearchParams(window.location.search).get('surface') === 'settings' ? 'Settings shell' : 'Editor shell')

function registerFoundationCommands(): void {
  const deferredCommands: AppCommandEvent['id'][] = [
    'file.new', 'file.save', 'file.saveAs',
    'file.export.html', 'file.export.pdf', 'file.export.docx',
    'view.mode.preview', 'view.mode.wysiwyg', 'view.mode.source', 'view.mode.split',
    'edit.find', 'edit.replace'
  ]
  for (const id of deferredCommands) {
    unsubscribers.push(commandRegistry.register(id, (event) => {
      // The command IDs are stable now; document-aware behavior is connected
      // by Issues 3-7 without creating parallel menu/toolbar code paths.
      lastCommand.value = `${event.id} (${event.source}) — awaiting document services`
    }))
  }

  unsubscribers.push(commandRegistry.register('file.open', async (event) => {
    lastCommand.value = `${event.id} (${event.source})`
    await selectMarkdown()
  }))
  unsubscribers.push(commandRegistry.register('file.openFolder', async (event) => {
    lastCommand.value = `${event.id} (${event.source})`
    const result = await window.markhere.dialogs.openWorkspace()
    if (!result.ok) errorCode.value = result.error.code
    else lastCommand.value = result.data ? 'workspace selection token issued' : 'workspace dialog cancelled'
  }))
  unsubscribers.push(commandRegistry.register('app.settings', async (event) => {
    lastCommand.value = `${event.id} (${event.source})`
    await window.markhere.app.openSettings()
  }))
}

async function loadInfo(): Promise<void> {
  const result = await window.markhere.app.getInfo()
  if (result.ok) appInfo.value = result.data
  else errorCode.value = result.error.code
}

async function selectMarkdown(): Promise<void> {
  const result = await window.markhere.dialogs.openDocuments({ allowMultiple: true })
  if (!result.ok) {
    errorCode.value = result.error.code
    return
  }
  lastCommand.value = result.data.length === 0
    ? 'file dialog cancelled'
    : `${result.data.length} authorized selection token(s) issued`
}

async function testSafeLink(): Promise<void> {
  const result = await window.markhere.shell.openExternal('https://www.electronjs.org/')
  if (!result.ok) errorCode.value = result.error.code
}

onMounted(() => {
  registerFoundationCommands()
  unsubscribers.push(window.markhere.events.onAppCommand((event) => void commandRegistry.execute(event)))
  unsubscribers.push(window.markhere.events.onWindowState((event) => { windowState.value = event }))
  void loadInfo()
})

onBeforeUnmount(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
})
</script>

<template>
  <main class="shell">
    <section class="card">
      <p class="eyebrow">MarkHere • Issue 2</p>
      <h1>{{ surface }}</h1>
      <p>
        The renderer is sandboxed and receives only the reviewed
        <code>window.markhere</code> capability API.
      </p>
      <dl>
        <div><dt>Bridge</dt><dd>v{{ window.markhere.version }}</dd></div>
        <div><dt>Application</dt><dd>{{ appInfo?.name ?? 'loading…' }} {{ appInfo?.version ?? '' }}</dd></div>
        <div><dt>Electron</dt><dd>{{ appInfo?.electron ?? 'loading…' }}</dd></div>
        <div><dt>Window</dt><dd>{{ windowState.maximized ? 'maximized' : 'normal' }}</dd></div>
        <div><dt>Last command</dt><dd>{{ lastCommand }}</dd></div>
        <div><dt>Window session</dt><dd>{{ windowSession.tabIds.length }} tab(s), {{ windowSession.workspaceId ?? 'no workspace' }}</dd></div>
      </dl>
      <p v-if="errorCode" class="error">{{ errorCode }}</p>
      <div class="actions">
        <button type="button" @click="commandRegistry.execute({ id: 'file.open', source: 'system' })">Open Markdown…</button>
        <button type="button" @click="testSafeLink">Open Electron Docs</button>
        <button type="button" @click="window.markhere.app.openSettings()">Settings</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(html), :global(body), :global(#app) { min-height: 100%; margin: 0; }
:global(body) { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0d1017; color: #e8ecf5; }
.shell { min-height: 100vh; display: grid; place-items: center; padding: 32px; }
.card { width: min(760px, 100%); padding: 32px; border: 1px solid #2c3445; border-radius: 18px; background: #151a24; box-shadow: 0 18px 70px rgba(0,0,0,.35); }
.eyebrow { margin: 0 0 8px; color: #93a4c7; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0 0 16px; font-size: 34px; }
p { color: #bac4d8; line-height: 1.6; }
code { color: #c6d8ff; }
dl { display: grid; gap: 8px; margin: 24px 0; }
dl div { display: grid; grid-template-columns: 150px 1fr; gap: 16px; }
dt { color: #8d9ab5; } dd { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
button { border: 1px solid #44506a; border-radius: 9px; background: #20283a; color: #f3f6ff; padding: 10px 14px; cursor: pointer; }
button:focus-visible { outline: 2px solid #8bb4ff; outline-offset: 2px; }
.error { color: #ff9a9a; }
</style>
