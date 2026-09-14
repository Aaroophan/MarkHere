<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppInfo, AppCommandEvent, MarkHereSettings, OpenDocumentDTO, RecoverySummary, WindowStateEvent } from '@markhere/ipc-contract'
import type { DocumentMode } from '@markhere/document-model'
import { RendererCommandRegistry } from './command-registry'
import { useWindowSessionStore } from './window-session-store'
import { useDocumentSessionStore } from './document-session-store'
import DocumentEditor from './components/DocumentEditor.vue'

const appInfo = ref<AppInfo | null>(null)
const errorCode = ref<string | null>(null)
const lastCommand = ref<string>('none')
const recoverables = ref<RecoverySummary[]>([])
const conflictDiskPreview = ref<string | null>(null)
const pendingPreviewAnchor = ref<string | null>(null)
const windowState = ref<WindowStateEvent>({ maximized: false, fullScreen: false, alwaysOnTop: false })
const commandRegistry = new RendererCommandRegistry()
const editor = ref<InstanceType<typeof DocumentEditor> | null>(null)
const settings = ref<MarkHereSettings>({ revision: 1, appearance: 'system', defaultMode: 'preview', autosave: false, remoteResources: 'block', lineNumbers: true, splitRatio: 0.5, syncScroll: true })
const windowSession = useWindowSessionStore()
const documents = useDocumentSessionStore()
const activeDocument = computed(() => windowSession.activeDocumentId ? documents.sessions[windowSession.activeDocumentId] ?? null : null)
const unsubscribers: Array<() => void> = []

const surface = computed(() => new URLSearchParams(window.location.search).get('surface') === 'settings' ? 'Settings shell' : 'Editor shell')

function registerFoundationCommands(): void {
  const deferredCommands: AppCommandEvent['id'][] = ['file.new', 'file.export.html', 'file.export.pdf', 'file.export.docx']
  for (const id of deferredCommands) unsubscribers.push(commandRegistry.register(id, (event) => { lastCommand.value = `${event.id} (${event.source}) — awaiting later issue` }))

  const modeCommands: ReadonlyArray<readonly [AppCommandEvent['id'], DocumentMode]> = [
    ['view.mode.preview', 'preview'], ['view.mode.wysiwyg', 'wysiwyg'], ['view.mode.source', 'source'], ['view.mode.split', 'split']
  ]
  for (const [id, mode] of modeCommands) {
    unsubscribers.push(commandRegistry.register(id, async (event) => {
      lastCommand.value = `${event.id} (${event.source})`
      await editor.value?.transition(mode)
    }))
  }
  unsubscribers.push(commandRegistry.register('edit.find', (event) => { lastCommand.value = `${event.id} (${event.source})`; editor.value?.find() }))
  unsubscribers.push(commandRegistry.register('edit.replace', (event) => { lastCommand.value = `${event.id} (${event.source})`; editor.value?.replace() }))

  unsubscribers.push(commandRegistry.register('file.save', async (event) => {
    lastCommand.value = `${event.id} (${event.source})`
    await editor.value?.flushActiveEditable()
    const session = activeDocument.value
    if (!session?.file) return
    const result = await window.markhere.files.saveDocument({
      documentId: session.id,
      revision: session.buffer.revision,
      markdown: session.buffer.markdown,
      expectedDiskFingerprint: session.buffer.diskFingerprint,
      textFormat: session.buffer.textFormat
    })
    if (!result.ok) {
      errorCode.value = result.error.code
      if (result.error.code === 'DOC_EXTERNAL_CONFLICT') {
        const stat = await window.markhere.files.statDocument(session.id)
        documents.enterSaveConflict(session.id, stat.ok ? stat.data.fingerprint : null)
      }
    } else documents.applySave(result.data)
  }))
  unsubscribers.push(commandRegistry.register('file.saveAs', async (event) => {
    lastCommand.value = `${event.id} (${event.source})`
    await editor.value?.flushActiveEditable()
    const session = activeDocument.value
    if (!session) return
    const target = await window.markhere.dialogs.chooseSaveDocument(session.file?.basename ?? 'Untitled.md')
    if (!target.ok) { errorCode.value = target.error.code; return }
    if (!target.data) return
    const result = await window.markhere.files.saveDocumentAs({
      documentId: session.id,
      revision: session.buffer.revision,
      markdown: session.buffer.markdown,
      targetSelectionToken: target.data.selectionToken,
      textFormat: session.buffer.textFormat
    })
    if (!result.ok) errorCode.value = result.error.code
    else documents.applySaveAs(result.data)
  }))

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

async function loadSettings(): Promise<void> {
  const result = await window.markhere.settings.get()
  if (result.ok) settings.value = result.data
  else errorCode.value = result.error.code
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
  if (result.data.length === 0) { lastCommand.value = 'file dialog cancelled'; return }
  for (const selected of result.data) {
    const opened = await window.markhere.files.openSelected(selected.selectionToken)
    if (!opened.ok) { errorCode.value = opened.error.code; continue }
    activateOpenedDocument(opened.data)
  }
  lastCommand.value = `${result.data.length} document selection(s) processed`
}



function activateOpenedDocument(document: OpenDocumentDTO, anchor?: string): void {
  documents.open(document, settings.value.defaultMode)
  if (!windowSession.tabIds.includes(document.documentId)) windowSession.tabIds.push(document.documentId)
  windowSession.activeDocumentId = document.documentId
  pendingPreviewAnchor.value = anchor ?? null
}

function activateExistingDocument(documentId: string, anchor?: string): void {
  if (!documents.sessions[documentId]) return
  windowSession.activeDocumentId = documentId
  pendingPreviewAnchor.value = anchor ?? null
}

async function inspectConflict(): Promise<void> {
  const session = activeDocument.value
  if (!session?.conflict) return
  const result = await window.markhere.files.reloadDocument(session.id)
  if (!result.ok) { errorCode.value = result.error.code; return }
  conflictDiskPreview.value = result.data.markdown.slice(0, 4000)
}

async function reloadConflictFromDisk(): Promise<void> {
  // Drain the active editor before the user explicitly replaces local state,
  // so no same-frame Source/WYSIWYG mutation can land after the disk reload.
  await editor.value?.flushActiveEditable()
  const session = activeDocument.value
  if (!session?.conflict) return
  const result = await window.markhere.files.reloadDocument(session.id)
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.applyReload(result.data)
  conflictDiskPreview.value = null
}

async function overwriteConflict(): Promise<void> {
  // Overwrite is still a persistence action: it must snapshot the same
  // canonical revision discipline as Save/Save As.
  await editor.value?.flushActiveEditable()
  const session = activeDocument.value
  if (!session?.conflict || !session.file) return
  const stat = await window.markhere.files.statDocument(session.id)
  if (!stat.ok) { errorCode.value = stat.error.code; return }
  const result = await window.markhere.files.saveDocument({
    documentId: session.id,
    revision: session.buffer.revision,
    markdown: session.buffer.markdown,
    expectedDiskFingerprint: stat.data.fingerprint,
    textFormat: session.buffer.textFormat
  })
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.applySave(result.data)
  conflictDiskPreview.value = null
}

async function discardRecovery(summary: RecoverySummary): Promise<void> {
  const result = await window.markhere.recovery.discard(summary.snapshotId)
  if (!result.ok) { errorCode.value = result.error.code; return }
  recoverables.value = recoverables.value.filter((item) => item.snapshotId !== summary.snapshotId)
}

async function loadRecoveries(): Promise<void> {
  const result = await window.markhere.recovery.listRecoverable()
  if (result.ok) recoverables.value = result.data
  else errorCode.value = result.error.code
}

async function restoreRecovery(summary: RecoverySummary): Promise<void> {
  const result = await window.markhere.recovery.getSnapshot(summary.snapshotId)
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.restoreRecovery(result.data)
  if (!windowSession.tabIds.includes(result.data.documentId)) windowSession.tabIds.push(result.data.documentId)
  windowSession.activeDocumentId = result.data.documentId
  recoverables.value = recoverables.value.filter((item) => item.snapshotId !== summary.snapshotId)
}

async function testSafeLink(): Promise<void> {
  const result = await window.markhere.shell.openExternal('https://www.electronjs.org/')
  if (!result.ok) errorCode.value = result.error.code
}

onMounted(() => {
  registerFoundationCommands()
  unsubscribers.push(window.markhere.events.onAppCommand((event) => void commandRegistry.execute(event)))
  unsubscribers.push(window.markhere.events.onWindowState((event) => { windowState.value = event }))
  unsubscribers.push(window.markhere.events.onDocumentExternalChange(async (event) => {
    const session = documents.sessions[event.documentId]
    if (!session) return
    if (!session.buffer.dirty && event.kind === 'changed') {
      const reloaded = await window.markhere.files.reloadDocument(event.documentId)
      if (reloaded.ok) documents.applyReload(reloaded.data)
      else errorCode.value = reloaded.error.code
      return
    }
    documents.handleExternalChange(event)
  }))
  void loadSettings()
  void loadInfo()
  void loadRecoveries()
})

onBeforeUnmount(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
})
</script>

<template>
  <main class="shell">
    <section class="card">
      <p class="eyebrow">MarkHere • Issue 5</p>
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
        <div><dt>Document</dt><dd>{{ activeDocument?.title ?? 'none' }}<template v-if="activeDocument"> — rev {{ activeDocument.buffer.revision }}/{{ activeDocument.buffer.persistedRevision }}{{ activeDocument.buffer.dirty ? ' dirty' : ' saved' }}{{ activeDocument.conflict ? ' • CONFLICT' : '' }}</template></dd></div>
      </dl>
      <p v-if="errorCode" class="error">{{ errorCode }}</p>
      <div v-if="recoverables.length" class="recovery">
        <strong>{{ recoverables.length }} recoverable document(s)</strong>
        <div v-for="item in recoverables" :key="item.snapshotId" class="recovery-row"><button type="button" @click="restoreRecovery(item)">Restore {{ item.title }}</button><button type="button" @click="discardRecovery(item)">Discard</button></div>
      </div>
      <div v-if="activeDocument?.conflict" class="conflict">
        <strong>External file conflict: {{ activeDocument.conflict.reason }}</strong>
        <div class="actions">
          <button type="button" @click="inspectConflict">Compare / Inspect Disk</button>
          <button type="button" @click="reloadConflictFromDisk">Reload Disk</button>
          <button type="button" @click="commandRegistry.execute({ id: 'file.saveAs', source: 'system' })">Save Local As…</button>
          <button type="button" @click="overwriteConflict">Overwrite Disk</button>
        </div>
        <pre v-if="conflictDiskPreview">{{ conflictDiskPreview }}</pre>
      </div>
      <div class="actions">
        <button type="button" @click="commandRegistry.execute({ id: 'file.open', source: 'system' })">Open Markdown…</button>
        <button type="button" @click="testSafeLink">Open Electron Docs</button>
        <button type="button" @click="window.markhere.app.openSettings()">Settings</button>
      </div>
      <DocumentEditor
        v-if="activeDocument"
        :key="activeDocument.id"
        ref="editor"
        :document-id="activeDocument.id"
        :settings="settings"
        :requested-anchor="pendingPreviewAnchor"
        @opened-document="activateOpenedDocument"
        @activate-existing-document="activateExistingDocument"
        @anchor-consumed="pendingPreviewAnchor = null"
        @settings-changed="settings = $event"
        @error="errorCode = $event"
      />
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
.recovery { display: grid; gap: 8px; margin: 16px 0; padding: 12px; border: 1px solid #775d2b; border-radius: 9px; background: #261f13; }
.recovery-row { display: flex; gap: 8px; }
.conflict { display: grid; gap: 10px; margin: 16px 0; padding: 12px; border: 1px solid #8b3e3e; border-radius: 9px; background: #2a1717; }
.conflict pre { max-height: 220px; overflow: auto; white-space: pre-wrap; background: #111318; padding: 10px; border-radius: 6px; }
</style>
