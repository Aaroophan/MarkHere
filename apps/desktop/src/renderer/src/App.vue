<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  AppCommandEvent,
  AppInfo,
  CommandId,
  KeybindingConfig,
  MarkHereSettings,
  OpenDocumentDTO,
  RecentItemDTO,
  RecoverySummary,
  WindowStateEvent
} from '@markhere/ipc-contract'
import type { DocumentMode, StructuralAnchor } from '@markhere/document-model'
import { parseMarkdown, type MarkdownHeading } from '@markhere/markdown-engine'
import { RendererCommandRegistry } from './command-registry'
import { useWindowSessionStore } from './window-session-store'
import { useDocumentSessionStore } from './document-session-store'
import { useWorkspaceStore } from './workspace-store'
import DocumentEditor from './components/DocumentEditor.vue'
import WorkspaceTree from './components/WorkspaceTree.vue'
import WorkspaceSearch from './components/WorkspaceSearch.vue'
import CommandPalette from './components/CommandPalette.vue'
import SettingsView from './components/SettingsView.vue'

const DEFAULT_SETTINGS: MarkHereSettings = {
  revision: 1,
  appearance: 'system',
  defaultMode: 'preview',
  autosave: false,
  autosaveDelayMs: 2_000,
  remoteResources: 'block',
  lineNumbers: true,
  splitRatio: 0.5,
  syncScroll: true,
  imageStorage: 'beside-document'
}
const EMPTY_KEYBINDINGS: KeybindingConfig = { revision: 0, bindings: {} }

const appInfo = ref<AppInfo | null>(null)
const platform = ref('win32')
const errorCode = ref<string | null>(null)
const notice = ref<string | null>(null)
const recoverables = ref<RecoverySummary[]>([])
const conflictDiskPreview = ref<string | null>(null)
const requestedAnchor = ref<string | null>(null)
const windowState = ref<WindowStateEvent>({ maximized: false, fullScreen: false, alwaysOnTop: false })
const settings = ref<MarkHereSettings>(DEFAULT_SETTINGS)
const keybindings = ref<KeybindingConfig>(EMPTY_KEYBINDINGS)
const recentFiles = ref<RecentItemDTO[]>([])
const recentWorkspaces = ref<RecentItemDTO[]>([])
const commandPaletteOpen = ref(false)
const editorStatus = ref<{ mode: DocumentMode; line?: number; column?: number }>({ mode: 'preview' })
const navigationAnchor = ref<StructuralAnchor>({ sourceLine: 0 })
const sidebarPanel = ref<'files' | 'outline' | 'search'>('files')
const isSettingsSurface = new URLSearchParams(window.location.search).get('surface') === 'settings'
const commandRegistry = new RendererCommandRegistry()
const editor = ref<InstanceType<typeof DocumentEditor> | null>(null)
const windowSession = useWindowSessionStore()
const documents = useDocumentSessionStore()
const workspaceStore = useWorkspaceStore()
const unsubscribers: Array<() => void> = []
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
let systemThemeQuery: MediaQueryList | null = null
let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null

const activeDocument = computed(() => windowSession.activeDocumentId ? documents.sessions[windowSession.activeDocumentId] ?? null : null)
const activeWorkspace = computed(() => workspaceStore.workspace)
const tabSessions = computed(() => windowSession.tabIds.flatMap((id) => documents.sessions[id] ? [documents.sessions[id]!] : []))
const wordCount = computed(() => {
  const text = activeDocument.value?.buffer.markdown.trim() ?? ''
  return text ? text.split(/\s+/u).length : 0
})
const outline = computed<readonly MarkdownHeading[]>(() => {
  const session = activeDocument.value
  if (!session) return []
  try { return parseMarkdown({ markdown: session.buffer.markdown, revision: session.buffer.revision }).headings }
  catch { return [] }
})
const activeHeadingSlug = computed(() => {
  const line = navigationAnchor.value.sourceLine ?? 0
  let current: MarkdownHeading | null = null
  for (const heading of outline.value) if ((heading.sourceRange?.startLine ?? 0) <= line) current = heading
  return current?.slug ?? null
})
const hasEditableDocument = computed(() => !!activeDocument.value && activeDocument.value.view.mode !== 'preview')

function applyTheme(): void {
  const prefersDark = systemThemeQuery?.matches ?? false
  const effective = settings.value.appearance === 'system' ? (prefersDark ? 'dark' : 'light') : settings.value.appearance
  document.documentElement.dataset.theme = effective
  document.documentElement.style.colorScheme = effective
}

async function loadFoundationState(): Promise<void> {
  const [info, platformInfo, settingsResult, bindingsResult, filesResult, workspacesResult] = await Promise.all([
    window.markhere.app.getInfo(),
    window.markhere.app.getPlatformInfo(),
    window.markhere.settings.get(),
    window.markhere.settings.getKeybindings(),
    window.markhere.files.listRecent(),
    window.markhere.workspaces.listRecent()
  ])
  if (info.ok) appInfo.value = info.data
  if (platformInfo.ok) platform.value = platformInfo.data.platform
  if (settingsResult.ok) settings.value = settingsResult.data; else errorCode.value = settingsResult.error.code
  if (bindingsResult.ok) keybindings.value = bindingsResult.data
  if (filesResult.ok) recentFiles.value = filesResult.data
  if (workspacesResult.ok) recentWorkspaces.value = workspacesResult.data
  applyTheme()
}

async function loadRecoveries(): Promise<void> {
  const result = await window.markhere.recovery.listRecoverable()
  if (result.ok) recoverables.value = result.data
  else errorCode.value = result.error.code
}

function activateOpenedDocument(document: OpenDocumentDTO, anchor?: string): void {
  if (!documents.sessions[document.documentId]) documents.open(document, settings.value.defaultMode)
  if (!windowSession.tabIds.includes(document.documentId)) windowSession.tabIds.push(document.documentId)
  windowSession.activeDocumentId = document.documentId
  requestedAnchor.value = anchor ?? null
  void refreshRecentFiles()
  if (anchor?.startsWith('@line:')) {
    const line = Number(anchor.slice(6))
    requestedAnchor.value = null
    void nextTick().then(() => editor.value?.navigateToHeading(Math.max(0, line - 1)))
  }
}

function activateExistingDocument(documentId: string, anchor?: string): void {
  if (!documents.sessions[documentId]) return
  windowSession.activeDocumentId = documentId
  requestedAnchor.value = anchor ?? null
}

function createUntitled(): void {
  const session = documents.createUntitled(settings.value.defaultMode === 'preview' ? 'source' : settings.value.defaultMode)
  windowSession.tabIds.push(session.id)
  windowSession.activeDocumentId = session.id
  notice.value = 'New unsaved document created.'
}

async function selectMarkdown(): Promise<void> {
  const result = await window.markhere.dialogs.openDocuments({ allowMultiple: true })
  if (!result.ok) { errorCode.value = result.error.code; return }
  for (const selected of result.data) {
    const opened = await window.markhere.files.openSelected(selected.selectionToken)
    if (!opened.ok) errorCode.value = opened.error.code
    else activateOpenedDocument(opened.data)
  }
}

async function openWorkspaceDialog(): Promise<void> {
  const selected = await window.markhere.dialogs.openWorkspace()
  if (!selected.ok) { errorCode.value = selected.error.code; return }
  if (!selected.data) return
  const result = await window.markhere.workspaces.open(selected.data.selectionToken)
  if (!result.ok) { errorCode.value = result.error.code; return }
  if (activeWorkspace.value && activeWorkspace.value.workspaceId !== result.data.workspaceId) await window.markhere.workspaces.close(activeWorkspace.value.workspaceId)
  workspaceStore.setWorkspace(result.data)
  windowSession.workspaceId = result.data.workspaceId
  sidebarPanel.value = 'files'
  await refreshRecentWorkspaces()
}

async function reopenRecentFile(item: RecentItemDTO): Promise<void> {
  const result = await window.markhere.files.reopenRecent(item.id)
  if (!result.ok) { errorCode.value = result.error.code; if (result.error.code.includes('NOT_FOUND')) await removeRecentFile(item.id); return }
  activateOpenedDocument(result.data)
}

async function reopenRecentWorkspace(item: RecentItemDTO): Promise<void> {
  const result = await window.markhere.workspaces.reopenRecent(item.id)
  if (!result.ok) { errorCode.value = result.error.code; if (result.error.code.includes('NOT_FOUND')) await removeRecentWorkspace(item.id); return }
  if (activeWorkspace.value) await window.markhere.workspaces.close(activeWorkspace.value.workspaceId)
  workspaceStore.setWorkspace(result.data)
  windowSession.workspaceId = result.data.workspaceId
  sidebarPanel.value = 'files'
}

async function closeWorkspace(): Promise<void> {
  const current = activeWorkspace.value
  if (!current) return
  const result = await window.markhere.workspaces.close(current.workspaceId)
  if (!result.ok) { errorCode.value = result.error.code; return }
  workspaceStore.setWorkspace(null)
  windowSession.workspaceId = null
}

async function refreshRecentFiles(): Promise<void> { const result = await window.markhere.files.listRecent(); if (result.ok) recentFiles.value = result.data }
async function refreshRecentWorkspaces(): Promise<void> { const result = await window.markhere.workspaces.listRecent(); if (result.ok) recentWorkspaces.value = result.data }
async function removeRecentFile(id: string): Promise<void> { const result = await window.markhere.files.removeRecent(id); if (result.ok) await refreshRecentFiles() }
async function removeRecentWorkspace(id: string): Promise<void> { const result = await window.markhere.workspaces.removeRecent(id); if (result.ok) await refreshRecentWorkspaces() }
async function clearRecentFiles(): Promise<void> { const result = await window.markhere.files.clearRecent(); if (result.ok) recentFiles.value = [] }
async function clearRecentWorkspaces(): Promise<void> { const result = await window.markhere.workspaces.clearRecent(); if (result.ok) recentWorkspaces.value = [] }

async function saveDocumentById(documentId: string, automatic = false): Promise<boolean> {
  if (windowSession.activeDocumentId === documentId) await editor.value?.flushActiveEditable()
  const session = documents.sessions[documentId]
  if (!session) return false
  if (!session.file) {
    if (automatic) return false
    return saveDocumentAs(documentId)
  }
  if (session.conflict) return false
  const result = await window.markhere.files.saveDocument({
    documentId: session.id,
    revision: session.buffer.revision,
    markdown: session.buffer.markdown,
    expectedDiskFingerprint: session.buffer.diskFingerprint,
    textFormat: session.buffer.textFormat
  })
  if (!result.ok) {
    if (!automatic) errorCode.value = result.error.code
    if (result.error.code === 'DOC_EXTERNAL_CONFLICT') {
      const statResult = await window.markhere.files.statDocument(session.id)
      documents.enterSaveConflict(session.id, statResult.ok ? statResult.data.fingerprint : null)
    }
    return false
  }
  documents.applySave(result.data)
  return true
}

async function saveDocumentAs(documentId = activeDocument.value?.id): Promise<boolean> {
  if (!documentId) return false
  if (windowSession.activeDocumentId === documentId) await editor.value?.flushActiveEditable()
  const session = documents.sessions[documentId]
  if (!session) return false
  const target = await window.markhere.dialogs.chooseSaveDocument(session.file?.basename ?? session.title ?? 'Untitled.md')
  if (!target.ok) { errorCode.value = target.error.code; return false }
  if (!target.data) return false
  const result = await window.markhere.files.saveDocumentAs({ documentId: session.id, revision: session.buffer.revision, markdown: session.buffer.markdown, targetSelectionToken: target.data.selectionToken, textFormat: session.buffer.textFormat })
  if (!result.ok) { errorCode.value = result.error.code; return false }
  documents.applySaveAs(result.data)
  await refreshRecentFiles()
  return true
}

function scheduleAutosaves(): void {
  const desired = new Set<string>()
  if (settings.value.autosave) {
    for (const session of Object.values(documents.sessions)) {
      if (!session.buffer.dirty || !session.file || session.conflict || !session.file.writable) continue
      desired.add(session.id)
      if (autosaveTimers.has(session.id)) continue
      const timer = setTimeout(() => {
        autosaveTimers.delete(session.id)
        void saveDocumentById(session.id, true)
      }, settings.value.autosaveDelayMs)
      autosaveTimers.set(session.id, timer)
    }
  }
  for (const [id, timer] of autosaveTimers) if (!desired.has(id)) { clearTimeout(timer); autosaveTimers.delete(id) }
}

async function inspectConflict(): Promise<void> {
  const session = activeDocument.value
  if (!session?.conflict) return
  const result = await window.markhere.files.reloadDocument(session.id)
  if (!result.ok) { errorCode.value = result.error.code; return }
  conflictDiskPreview.value = result.data.markdown.slice(0, 4000)
}

async function reloadConflictFromDisk(): Promise<void> {
  await editor.value?.flushActiveEditable()
  const session = activeDocument.value
  if (!session?.conflict) return
  const result = await window.markhere.files.reloadDocument(session.id)
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.applyReload(result.data); conflictDiskPreview.value = null
}

async function overwriteConflict(): Promise<void> {
  await editor.value?.flushActiveEditable()
  const session = activeDocument.value
  if (!session?.conflict || !session.file) return
  const statResult = await window.markhere.files.statDocument(session.id)
  if (!statResult.ok) { errorCode.value = statResult.error.code; return }
  const result = await window.markhere.files.saveDocument({ documentId: session.id, revision: session.buffer.revision, markdown: session.buffer.markdown, expectedDiskFingerprint: statResult.data.fingerprint, textFormat: session.buffer.textFormat })
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.applySave(result.data); conflictDiskPreview.value = null
}

async function restoreRecovery(summary: RecoverySummary): Promise<void> {
  const result = await window.markhere.recovery.getSnapshot(summary.snapshotId)
  if (!result.ok) { errorCode.value = result.error.code; return }
  documents.restoreRecovery(result.data)
  if (!windowSession.tabIds.includes(result.data.documentId)) windowSession.tabIds.push(result.data.documentId)
  windowSession.activeDocumentId = result.data.documentId
  recoverables.value = recoverables.value.filter((item) => item.snapshotId !== summary.snapshotId)
}
async function discardRecovery(summary: RecoverySummary): Promise<void> { const result = await window.markhere.recovery.discard(summary.snapshotId); if (result.ok) recoverables.value = recoverables.value.filter((item) => item.snapshotId !== summary.snapshotId); else errorCode.value = result.error.code }

function headingIndent(level: number): string { return `${Math.max(0, level - 1) * 12}px` }
function navigateOutline(heading: MarkdownHeading): void { void editor.value?.navigateToHeading(heading.sourceRange?.startLine ?? 0, heading.slug) }

function fileToDataUri(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunk = 16_384
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)))
  return `data:${mimeType};base64,${btoa(binary)}`
}

async function importImage(file: File): Promise<void> {
  const session = activeDocument.value
  if (!session || file.size <= 0 || file.size > 8 * 1024 * 1024) { errorCode.value = 'IMAGE_SIZE_INVALID'; return }
  const mimeType = file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) { errorCode.value = 'IMAGE_TYPE_UNSUPPORTED'; return }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let markdownPath: string
  if (settings.value.imageStorage === 'data-uri') markdownPath = fileToDataUri(bytes, mimeType)
  else {
    if (!session.file) { errorCode.value = 'IMAGE_REQUIRES_SAVED_DOCUMENT'; return }
    const result = await window.markhere.files.copyImportedImage({ documentId: session.id, mimeType, bytes, preferredName: file.name || 'image' })
    if (!result.ok) { errorCode.value = result.error.code; return }
    markdownPath = result.data.markdownPath
  }
  const alt = (file.name || 'image').replace(/\.[^.]+$/u, '')
  await editor.value?.insertMarkdown(`![${alt}](${markdownPath})`)
}

function imageFromTransfer(items: FileList | null): File | null {
  if (!items) return null
  return [...items].find((file) => file.type.startsWith('image/')) ?? null
}
function onPaste(event: ClipboardEvent): void { const file = imageFromTransfer(event.clipboardData?.files ?? null); if (!file) return; event.preventDefault(); void importImage(file) }
function onDrop(event: DragEvent): void { const file = imageFromTransfer(event.dataTransfer?.files ?? null); if (!file) return; event.preventDefault(); void importImage(file) }

function registerCommands(): void {
  unsubscribers.push(commandRegistry.register('file.new', () => createUntitled()))
  unsubscribers.push(commandRegistry.register('file.open', () => selectMarkdown()))
  unsubscribers.push(commandRegistry.register('file.openFolder', () => openWorkspaceDialog()))
  unsubscribers.push(commandRegistry.register('file.save', () => { const id = activeDocument.value?.id; if (id) void saveDocumentById(id) }))
  unsubscribers.push(commandRegistry.register('file.saveAs', () => { void saveDocumentAs() }))
  for (const id of ['file.export.html', 'file.export.pdf', 'file.export.docx'] as const) unsubscribers.push(commandRegistry.register(id, () => { notice.value = `${id} is implemented in Issue 7.` }))
  for (const [id, mode] of [['view.mode.preview', 'preview'], ['view.mode.wysiwyg', 'wysiwyg'], ['view.mode.source', 'source'], ['view.mode.split', 'split']] as ReadonlyArray<readonly [CommandId, DocumentMode]>) unsubscribers.push(commandRegistry.register(id, () => editor.value?.transition(mode)))
  unsubscribers.push(commandRegistry.register('edit.find', () => editor.value?.find()))
  unsubscribers.push(commandRegistry.register('edit.replace', () => editor.value?.replace()))
  unsubscribers.push(commandRegistry.register('app.settings', () => window.markhere.app.openSettings()))
  unsubscribers.push(commandRegistry.register('app.commandPalette', () => { commandPaletteOpen.value = true }))
  unsubscribers.push(commandRegistry.register('app.quit', () => window.markhere.app.requestQuit()))
}

function executePaletteCommand(id: CommandId): void { void commandRegistry.execute({ id, source: 'shortcut' }) }

watch(() => Object.values(documents.sessions).map((session) => `${session.id}:${session.buffer.revision}:${session.buffer.dirty}:${!!session.conflict}`).join('|'), scheduleAutosaves)
watch(() => [settings.value.autosave, settings.value.autosaveDelayMs] as const, scheduleAutosaves)
watch(() => settings.value.appearance, applyTheme)
watch(() => activeDocument.value?.id, () => { conflictDiskPreview.value = null; navigationAnchor.value = { sourceLine: 0 }; editorStatus.value = { mode: activeDocument.value?.view.mode ?? 'preview' } })

onMounted(async () => {
  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemThemeListener = () => applyTheme()
  systemThemeQuery.addEventListener('change', systemThemeListener)
  await loadFoundationState()
  if (isSettingsSurface) return
  registerCommands()
  unsubscribers.push(window.markhere.events.onAppCommand((event: AppCommandEvent) => void commandRegistry.execute(event)))
  unsubscribers.push(window.markhere.events.onWindowState((event) => { windowState.value = event }))
  unsubscribers.push(window.markhere.events.onSettingsChanged((event) => { settings.value = event.settings; applyTheme() }))
  unsubscribers.push(window.markhere.events.onKeybindingsChanged((event) => { keybindings.value = event.config }))
  unsubscribers.push(window.markhere.events.onDocumentExternalChange(async (event) => {
    const session = documents.sessions[event.documentId]
    if (!session) return
    if (!session.buffer.dirty && event.kind === 'changed') {
      const reloaded = await window.markhere.files.reloadDocument(event.documentId)
      if (reloaded.ok) documents.applyReload(reloaded.data); else errorCode.value = reloaded.error.code
    } else documents.handleExternalChange(event)
  }))
  await loadRecoveries()
})

onBeforeUnmount(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
  for (const timer of autosaveTimers.values()) clearTimeout(timer)
  if (systemThemeQuery && systemThemeListener) systemThemeQuery.removeEventListener('change', systemThemeListener)
})
</script>

<template>
  <SettingsView
    v-if="isSettingsSurface"
    :initial-settings="settings"
    :initial-keybindings="keybindings"
    :platform="platform"
    @settings-changed="settings = $event"
    @keybindings-changed="keybindings = $event"
  />

  <main v-else class="desktop-shell" @paste.capture="onPaste" @dragover.prevent @drop="onDrop">
    <header class="titlebar">
      <div class="brand"><strong>MarkHere</strong><span>{{ activeWorkspace?.basename ?? 'Markdown desktop' }}</span></div>
      <div class="window-actions" role="group" aria-label="Window controls">
        <button type="button" title="Command palette" aria-label="Command palette" @click="commandPaletteOpen = true">⌘</button>
        <button type="button" title="Settings" aria-label="Settings" @click="window.markhere.app.openSettings()">⚙</button>
        <button type="button" title="Minimize" aria-label="Minimize window" @click="window.markhere.window.minimize()">—</button>
        <button type="button" :title="windowState.maximized ? 'Restore' : 'Maximize'" :aria-label="windowState.maximized ? 'Restore window' : 'Maximize window'" @click="window.markhere.window.toggleMaximize()">□</button>
        <button type="button" class="close" title="Close" aria-label="Close window" @click="window.markhere.window.close()">×</button>
      </div>
    </header>

    <nav class="toolbar" aria-label="Main toolbar">
      <button type="button" @click="createUntitled">New</button>
      <button type="button" @click="selectMarkdown">Open</button>
      <button type="button" @click="openWorkspaceDialog">Open Folder</button>
      <button type="button" :disabled="!activeDocument" @click="activeDocument && saveDocumentById(activeDocument.id)">Save</button>
      <button type="button" :disabled="!activeDocument" @click="saveDocumentAs()">Save As</button>
      <span class="spacer"></span>
      <button v-if="activeWorkspace" type="button" @click="closeWorkspace">Close Workspace</button>
    </nav>

    <div class="tab-strip" role="tablist" aria-label="Open documents">
      <button
        v-for="session in tabSessions"
        :key="session.id"
        type="button"
        role="tab"
        :aria-selected="windowSession.activeDocumentId === session.id"
        :class="{ active: windowSession.activeDocumentId === session.id, conflict: !!session.conflict }"
        @click="windowSession.activeDocumentId = session.id"
      >
        <span>{{ session.title }}</span>
        <span v-if="session.conflict" class="state-label" aria-label="conflict">!</span>
        <span v-else-if="session.buffer.dirty" class="state-label" aria-label="unsaved">●</span>
        <span v-else class="state-label saved" aria-label="saved">✓</span>
      </button>
      <span v-if="tabSessions.length === 0" class="no-tabs">No documents open</span>
    </div>

    <div class="workspace-area">
      <aside v-if="windowSession.layout.sidebarVisible" class="sidebar" :style="{ width: `${windowSession.layout.sidebarWidth}px` }" aria-label="Navigation sidebar">
        <div class="sidebar-tabs" role="tablist" aria-label="Sidebar views">
          <button type="button" role="tab" :aria-selected="sidebarPanel === 'files'" @click="sidebarPanel = 'files'">Files</button>
          <button type="button" role="tab" :aria-selected="sidebarPanel === 'outline'" @click="sidebarPanel = 'outline'">Outline</button>
          <button type="button" role="tab" :aria-selected="sidebarPanel === 'search'" @click="sidebarPanel = 'search'">Search</button>
        </div>
        <WorkspaceTree v-if="sidebarPanel === 'files' && activeWorkspace" :workspace-id="activeWorkspace.workspaceId" @opened-document="activateOpenedDocument" @error="errorCode = $event" />
        <section v-else-if="sidebarPanel === 'files'" class="sidebar-empty"><p>No workspace open.</p><button type="button" @click="openWorkspaceDialog">Open Folder…</button></section>
        <nav v-else-if="sidebarPanel === 'outline'" class="outline" aria-label="Document outline">
          <button v-for="heading in outline" :key="`${heading.slug}:${heading.sourceRange?.startLine ?? 0}`" type="button" :class="{ active: activeHeadingSlug === heading.slug }" :style="{ paddingInlineStart: headingIndent(heading.level) }" @click="navigateOutline(heading)">{{ heading.text }}</button>
          <p v-if="!activeDocument || outline.length === 0">No headings.</p>
        </nav>
        <WorkspaceSearch v-else-if="activeWorkspace" :workspace-id="activeWorkspace.workspaceId" @opened-document="activateOpenedDocument" @error="errorCode = $event" />
        <section v-else class="sidebar-empty"><p>Open a workspace to search its files.</p></section>
      </aside>

      <section class="document-area" aria-label="Document area">
        <div v-if="errorCode || notice" class="notification" :class="{ error: !!errorCode }" role="status"><span>{{ errorCode ?? notice }}</span><button type="button" aria-label="Dismiss message" @click="errorCode = null; notice = null">×</button></div>

        <div v-if="recoverables.length" class="recovery-banner">
          <strong>Recovery snapshots available</strong>
          <div v-for="item in recoverables" :key="item.snapshotId"><button type="button" @click="restoreRecovery(item)">Restore {{ item.title }}</button><button type="button" @click="discardRecovery(item)">Discard</button></div>
        </div>

        <div v-if="activeDocument?.conflict" class="conflict-banner" role="alert">
          <strong>External file conflict: {{ activeDocument.conflict.reason }}</strong>
          <div><button type="button" @click="inspectConflict">Inspect Disk</button><button type="button" @click="reloadConflictFromDisk">Reload Disk</button><button type="button" @click="saveDocumentAs()">Save Local As…</button><button type="button" @click="overwriteConflict">Overwrite Disk</button></div>
          <pre v-if="conflictDiskPreview">{{ conflictDiskPreview }}</pre>
        </div>

        <DocumentEditor
          v-if="activeDocument"
          :key="activeDocument.id"
          ref="editor"
          :document-id="activeDocument.id"
          :settings="settings"
          :requested-anchor="requestedAnchor"
          @opened-document="activateOpenedDocument"
          @activate-existing-document="activateExistingDocument"
          @anchor-consumed="requestedAnchor = null"
          @settings-changed="settings = $event"
          @editor-status="editorStatus = $event"
          @navigation-anchor="navigationAnchor = $event"
          @error="errorCode = $event"
        />

        <section v-else class="welcome">
          <div class="welcome-main"><p class="eyebrow">MarkHere</p><h1>Write Markdown without giving up the document.</h1><p>Open a file, create a document, or open a normal folder as a workspace.</p><div class="welcome-actions"><button type="button" @click="createUntitled">New document</button><button type="button" @click="selectMarkdown">Open Markdown…</button><button type="button" @click="openWorkspaceDialog">Open Folder…</button></div></div>
          <div class="recent-columns">
            <section><header><strong>Recent documents</strong><button v-if="recentFiles.length" type="button" @click="clearRecentFiles">Clear</button></header><div v-for="item in recentFiles" :key="item.id" class="recent-row"><button type="button" class="recent" @click="reopenRecentFile(item)"><span>{{ item.basename }}</span><small>{{ item.displayPath }}</small></button><button type="button" class="remove" :aria-label="`Remove ${item.basename} from recents`" @click="removeRecentFile(item.id)">×</button></div><p v-if="recentFiles.length === 0">No recent documents.</p></section>
            <section><header><strong>Recent workspaces</strong><button v-if="recentWorkspaces.length" type="button" @click="clearRecentWorkspaces">Clear</button></header><div v-for="item in recentWorkspaces" :key="item.id" class="recent-row"><button type="button" class="recent" @click="reopenRecentWorkspace(item)"><span>{{ item.basename }}</span><small>{{ item.displayPath }}</small></button><button type="button" class="remove" :aria-label="`Remove ${item.basename} from recents`" @click="removeRecentWorkspace(item.id)">×</button></div><p v-if="recentWorkspaces.length === 0">No recent workspaces.</p></section>
          </div>
        </section>
      </section>
    </div>

    <footer v-if="windowSession.layout.statusBarVisible" class="statusbar" aria-label="Document status">
      <span>{{ editorStatus.mode }}</span>
      <span v-if="editorStatus.line">Ln {{ editorStatus.line }}, Col {{ editorStatus.column }}</span>
      <span v-if="activeDocument">{{ activeDocument.buffer.textFormat.encoding.toUpperCase() }}</span>
      <span v-if="activeDocument">{{ activeDocument.buffer.textFormat.lineEnding.toUpperCase() }}</span>
      <span v-if="activeDocument">{{ wordCount }} words</span>
      <span v-if="activeDocument" class="save-state">{{ activeDocument.conflict ? 'Conflict' : activeDocument.buffer.dirty ? (settings.autosave ? 'Unsaved · autosave on' : 'Unsaved') : 'Saved' }}</span>
      <span class="version">{{ appInfo?.version ?? '' }}</span>
    </footer>

    <CommandPalette :open="commandPaletteOpen" :has-document="!!activeDocument" :editable="hasEditableDocument" :keybindings="keybindings" :platform="platform" @close="commandPaletteOpen = false" @execute="executePaletteCommand" />
  </main>
</template>

<style>
:root {
  --mh-bg: #f4f6f8; --mh-panel: #ffffff; --mh-panel-alt: #f8fafc; --mh-text: #18212f; --mh-muted: #64748b; --mh-border: #d8dee8; --mh-hover: #eef2f7; --mh-selected: #dce9fb; --mh-accent: #2563eb; --mh-danger: #b42318; --mh-warning: #9a6700; --mh-shadow: rgb(15 23 42 / .12);
}
:root[data-theme='dark'] {
  --mh-bg: #0d1117; --mh-panel: #151b25; --mh-panel-alt: #111720; --mh-text: #e6edf3; --mh-muted: #9aa7b8; --mh-border: #303b4d; --mh-hover: #202938; --mh-selected: #263e60; --mh-accent: #79a8ff; --mh-danger: #ff9b91; --mh-warning: #e3b341; --mh-shadow: rgb(0 0 0 / .35);
}
* { box-sizing: border-box; } html, body, #app { min-width: 0; min-height: 100%; margin: 0; } body { overflow: hidden; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--mh-bg); color: var(--mh-text); } button, input, select { font: inherit; } button { border: 1px solid var(--mh-border); border-radius: 6px; background: var(--mh-panel-alt); color: var(--mh-text); padding: 6px 10px; cursor: pointer; } button:hover:not(:disabled) { background: var(--mh-hover); } button:disabled { cursor: not-allowed; opacity: .5; } input, select { border: 1px solid var(--mh-border); border-radius: 6px; background: var(--mh-panel); color: var(--mh-text); padding: 7px 8px; } :focus-visible { outline: 2px solid var(--mh-accent) !important; outline-offset: 2px; }
.desktop-shell { height: 100vh; display: grid; grid-template-rows: 38px 42px 38px minmax(0, 1fr) 26px; background: var(--mh-bg); }
.titlebar { display: flex; align-items: center; justify-content: space-between; padding-left: 12px; border-bottom: 1px solid var(--mh-border); background: var(--mh-panel); -webkit-app-region: drag; }.brand { min-width: 0; display: flex; align-items: baseline; gap: 10px; }.brand span { color: var(--mh-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.window-actions { height: 100%; display: flex; -webkit-app-region: no-drag; }.window-actions button { width: 42px; height: 100%; border: 0; border-radius: 0; background: transparent; }.window-actions .close:hover { background: #c42b1c; color: white; }
.toolbar { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-bottom: 1px solid var(--mh-border); background: var(--mh-panel-alt); }.toolbar .spacer { flex: 1; }
.tab-strip { display: flex; min-width: 0; overflow-x: auto; border-bottom: 1px solid var(--mh-border); background: var(--mh-panel-alt); }.tab-strip button { min-width: 120px; max-width: 230px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-right: 1px solid var(--mh-border); border-radius: 0; background: transparent; overflow: hidden; }.tab-strip button > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.tab-strip button.active { background: var(--mh-panel); box-shadow: inset 0 -2px var(--mh-accent); }.tab-strip button.conflict { box-shadow: inset 0 -2px var(--mh-danger); }.state-label { flex: 0 0 auto; color: var(--mh-warning); }.state-label.saved { color: var(--mh-muted); }.no-tabs { padding: 9px 12px; color: var(--mh-muted); font-size: 12px; }
.workspace-area { min-height: 0; display: flex; }.sidebar { min-width: 190px; max-width: 45vw; display: flex; flex-direction: column; border-right: 1px solid var(--mh-border); background: var(--mh-panel); }.sidebar-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--mh-border); }.sidebar-tabs button { border: 0; border-radius: 0; background: transparent; font-size: 11px; }.sidebar-tabs button[aria-selected='true'] { background: var(--mh-selected); box-shadow: inset 0 -2px var(--mh-accent); }.sidebar-empty { padding: 12px; color: var(--mh-muted); font-size: 12px; }.outline { min-height: 0; overflow: auto; padding: 5px; }.outline button { width: 100%; display: block; border: 0; background: transparent; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.outline button.active { background: var(--mh-selected); }.outline p { padding: 8px; color: var(--mh-muted); font-size: 12px; }
.document-area { position: relative; min-width: 0; min-height: 0; overflow: auto; background: var(--mh-bg); }.document-area > .document-editor { height: 100%; margin: 0; border: 0; border-radius: 0; }.notification { position: absolute; z-index: 12; top: 10px; right: 10px; display: flex; gap: 12px; align-items: center; max-width: 70%; padding: 8px 10px; border: 1px solid var(--mh-border); border-radius: 7px; background: var(--mh-panel); box-shadow: 0 6px 22px var(--mh-shadow); }.notification.error { border-color: var(--mh-danger); color: var(--mh-danger); }.notification button { border: 0; padding: 0 3px; background: transparent; }.recovery-banner,.conflict-banner { display: grid; gap: 7px; padding: 9px 12px; border-bottom: 1px solid var(--mh-border); background: color-mix(in srgb, var(--mh-warning) 10%, var(--mh-panel)); }.recovery-banner > div,.conflict-banner > div { display: flex; flex-wrap: wrap; gap: 6px; }.conflict-banner { background: color-mix(in srgb, var(--mh-danger) 10%, var(--mh-panel)); }.conflict-banner pre { max-height: 180px; overflow: auto; white-space: pre-wrap; }
.welcome { min-height: 100%; display: grid; align-content: center; gap: 28px; width: min(940px, 100%); margin: auto; padding: 42px; }.welcome-main { max-width: 660px; }.welcome .eyebrow { color: var(--mh-accent); font-weight: 700; text-transform: uppercase; letter-spacing: .14em; }.welcome h1 { margin: 6px 0 10px; font-size: clamp(26px, 4vw, 42px); }.welcome p { color: var(--mh-muted); }.welcome-actions { display: flex; flex-wrap: wrap; gap: 8px; }.recent-columns { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 20px; }.recent-columns section { min-width: 0; }.recent-columns header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }.recent-columns header button { border: 0; background: transparent; color: var(--mh-muted); }.recent { width: 100%; min-width: 0; display: grid; gap: 2px; border: 0; background: transparent; text-align: left; }.recent small { color: var(--mh-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.recent-row { display: grid; grid-template-columns: 1fr auto; }.recent-row .remove { border: 0; background: transparent; }
.statusbar { display: flex; align-items: center; gap: 16px; padding: 0 10px; border-top: 1px solid var(--mh-border); background: var(--mh-panel-alt); color: var(--mh-muted); font-size: 11px; }.statusbar .save-state { margin-left: auto; color: var(--mh-text); }.statusbar .version { margin-left: auto; }
@media (max-width: 760px) { .sidebar { width: 210px !important; }.recent-columns { grid-template-columns: 1fr; }.statusbar span:nth-of-type(n+4):not(.save-state) { display: none; } }
@media (forced-colors: active) { button[aria-selected='true'], .tab-strip button.active, .outline button.active { outline: 2px solid Highlight; outline-offset: -2px; }.state-label { forced-color-adjust: none; } }
</style>
