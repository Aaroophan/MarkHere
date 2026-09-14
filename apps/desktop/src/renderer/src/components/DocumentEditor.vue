<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { DocumentMode, StructuralAnchor } from '@markhere/document-model'
import type { MarkHereSettings, OpenDocumentDTO } from '@markhere/ipc-contract'
import { MuyaWysiwygEditorAdapter, WysiwygRoundTripUnsafeError, type WysiwygSelectionSnapshot } from '@markhere/editor-core'
import { ALL_MODE_TRANSITIONS, EDITOR_COMMAND_DEFINITIONS, ModeController, type EditorCommandId, type EditorFlushResult, type EditorNavigationSnapshot } from '@markhere/editor-session'
import { SourceEditorAdapter, type SourceEditorSelectionSnapshot } from '@markhere/source-editor'
import { useDocumentSessionStore } from '../document-session-store'
import PreviewPane from './PreviewPane.vue'

const props = defineProps<{
  documentId: string
  settings: MarkHereSettings
  requestedAnchor?: string | null
}>()

const emit = defineEmits<{
  openedDocument: [document: OpenDocumentDTO, anchor?: string]
  activateExistingDocument: [documentId: string, anchor?: string]
  anchorConsumed: []
  error: [message: string]
  settingsChanged: [settings: MarkHereSettings]
}>()

const documents = useDocumentSessionStore()
const session = computed(() => documents.sessions[props.documentId]!)
const renderMode = ref<DocumentMode>(session.value.view.mode)
const transitionState = ref<'idle' | 'flushing' | 'activating' | 'rolling-back'>('idle')
const sourceHost = ref<HTMLElement | null>(null)
const wysiwygHost = ref<HTMLElement | null>(null)
const previewPane = ref<InstanceType<typeof PreviewPane> | null>(null)
const splitPreviewPane = ref<InstanceType<typeof PreviewPane> | null>(null)
const splitContainer = ref<HTMLElement | null>(null)
const sourceAdapter = shallowRef<SourceEditorAdapter | null>(null)
const wysiwygAdapter = shallowRef<MuyaWysiwygEditorAdapter | null>(null)
let suspendedWysiwyg: { markdown: string; selection: WysiwygSelectionSnapshot } | null = null
const currentSettings = ref<MarkHereSettings>(props.settings)
const wysiwygSearchOpen = ref(false)
const wysiwygSearchQuery = ref('')
const wysiwygReplaceValue = ref('')
let controller: ModeController | null = null
let syncGuard = false
let dividerCleanup: (() => void) | null = null
let pendingSplitAnchor: StructuralAnchor | null = null

const modeButtons: ReadonlyArray<{ mode: DocumentMode; label: string; shortcut: string }> = [
  { mode: 'preview', label: 'Preview', shortcut: 'Ctrl+1' },
  { mode: 'wysiwyg', label: 'WYSIWYG', shortcut: 'Ctrl+2' },
  { mode: 'source', label: 'Source', shortcut: 'Ctrl+3' },
  { mode: 'split', label: 'Split', shortcut: 'Ctrl+4' }
]

const formatButtons = EDITOR_COMMAND_DEFINITIONS.filter((definition) => definition.toolbar)

function canonicalSnapshot(): { markdown: string; revision: number } {
  const current = session.value
  return { markdown: current.buffer.markdown, revision: current.buffer.revision }
}

function sourceNavigation(snapshot: SourceEditorSelectionSnapshot): EditorNavigationSnapshot {
  return { structuralAnchor: snapshot.structuralAnchor, selection: snapshot, scrollTop: snapshot.scrollTop }
}

function wysiwygNavigation(snapshot: WysiwygSelectionSnapshot): EditorNavigationSnapshot {
  return { structuralAnchor: snapshot.structuralAnchor, selection: snapshot, scrollTop: snapshot.scrollTop }
}

async function flush(surface: 'source' | 'wysiwyg'): Promise<EditorFlushResult> {
  const canonical = canonicalSnapshot()
  if (surface === 'source') {
    const result = sourceAdapter.value?.flush()
    if (!result) return { markdown: canonical.markdown, changed: false }
    return { markdown: result.markdown, changed: result.markdown !== canonical.markdown, ...sourceNavigation(result.selection) }
  }
  const result = await wysiwygAdapter.value?.flush()
  if (!result) return { markdown: canonical.markdown, changed: false }
  return { markdown: result.markdown, changed: result.markdown !== canonical.markdown, ...wysiwygNavigation(result.selection) }
}

function commitFlushed(surface: 'source' | 'wysiwyg', result: EditorFlushResult): { markdown: string; revision: number } {
  const current = session.value
  if (!result.changed || result.markdown === current.buffer.markdown) return canonicalSnapshot()
  const next = documents.commit(props.documentId, result.markdown, surface, `mode-flush:${surface}`)
  return { markdown: next.buffer.markdown, revision: next.buffer.revision }
}

function capture(surface: 'source' | 'wysiwyg'): EditorNavigationSnapshot {
  if (surface === 'source' && sourceAdapter.value) return sourceNavigation(sourceAdapter.value.captureSelection())
  if (surface === 'wysiwyg' && wysiwygAdapter.value) return wysiwygNavigation(wysiwygAdapter.value.captureSelection())
  return {}
}

function destroySource(): void { sourceAdapter.value?.destroy(); sourceAdapter.value = null }
function suspendWysiwyg(): void {
  const adapter = wysiwygAdapter.value
  if (!adapter) return
  suspendedWysiwyg = { markdown: adapter.markdown, selection: adapter.captureSelection() }
}
function destroyWysiwyg(): void {
  wysiwygAdapter.value?.destroy()
  wysiwygAdapter.value = null
  suspendedWysiwyg = null
}

function commitSourceChange(markdown: string, selection: SourceEditorSelectionSnapshot): void {
  const current = session.value
  if (markdown !== current.buffer.markdown) documents.commit(props.documentId, markdown, 'source', 'codemirror-transaction')
  documents.updateSourceView(props.documentId, {
    cursor: selection.cursor,
    selection: selection.selection,
    scrollTop: selection.scrollTop,
    structuralAnchor: selection.structuralAnchor
  })
}

function commitWysiwygChange(markdown: string, selection: WysiwygSelectionSnapshot): void {
  const current = session.value
  if (markdown !== current.buffer.markdown) documents.commit(props.documentId, markdown, 'wysiwyg', 'muya-json-change')
  documents.updateWysiwygView(props.documentId, {
    selectionBookmark: selection.bookmark,
    scrollAnchor: selection.structuralAnchor
  })
}

function releaseSyncGuard(): void {
  requestAnimationFrame(() => { syncGuard = false })
}

function syncFromSource(anchor: StructuralAnchor): void {
  if (renderMode.value !== 'split' || !session.value.view.split.syncScroll || syncGuard) return
  pendingSplitAnchor = anchor
  syncGuard = true
  splitPreviewPane.value?.scrollToStructuralAnchor(anchor)
  releaseSyncGuard()
}

function syncFromPreview(anchor: StructuralAnchor): void {
  if (renderMode.value !== 'split' || !session.value.view.split.syncScroll || syncGuard) return
  syncGuard = true
  sourceAdapter.value?.scrollToStructuralAnchor(anchor)
  releaseSyncGuard()
}

async function ensureSource(snapshot: { markdown: string; revision: number }, navigation: EditorNavigationSnapshot): Promise<void> {
  await nextTick()
  if (!sourceHost.value) throw new Error('Source editor host is unavailable.')
  if (!sourceAdapter.value) {
    sourceAdapter.value = markRaw(new SourceEditorAdapter(sourceHost.value, {
      markdown: snapshot.markdown,
      wrap: session.value.view.source.wrap,
      lineNumbers: currentSettings.value.lineNumbers,
      onChange: (change) => commitSourceChange(change.markdown, change.selection),
      onScrollAnchor: syncFromSource
    }))
  } else sourceAdapter.value.applyExternalRevision(snapshot.markdown)

  const incoming = navigation.selection as Partial<SourceEditorSelectionSnapshot> | Partial<WysiwygSelectionSnapshot> | undefined
  if (incoming && 'selection' in incoming) sourceAdapter.value.restoreSelection(incoming as Partial<SourceEditorSelectionSnapshot>)
  else if (incoming?.cursor) sourceAdapter.value.restoreSelection({ cursor: incoming.cursor })
  else if (navigation.structuralAnchor) sourceAdapter.value.scrollToStructuralAnchor(navigation.structuralAnchor)
}

async function ensureWysiwyg(snapshot: { markdown: string; revision: number }, navigation: EditorNavigationSnapshot): Promise<void> {
  await nextTick()
  if (!wysiwygHost.value) throw new Error('WYSIWYG editor host is unavailable.')
  if (!wysiwygAdapter.value) {
    wysiwygAdapter.value = markRaw(new MuyaWysiwygEditorAdapter(wysiwygHost.value, {
      markdown: snapshot.markdown,
      onChange: (change) => commitWysiwygChange(change.markdown, change.selection)
    }))
  } else if (snapshot.markdown !== wysiwygAdapter.value.markdown) {
    if (suspendedWysiwyg && snapshot.markdown !== suspendedWysiwyg.markdown) {
      // Keep the live Muya instance/history while Source is active. MarkHere's
      // adapter places the complete canonical Source edit above that history as
      // one synthetic undo boundary before restoring the incoming selection.
      wysiwygAdapter.value.replaceCanonicalWithUndoBoundary(snapshot.markdown)
    } else {
      // An authoritative reload/recovery/system replacement is not an editor
      // undo boundary; it invalidates old editor history instead.
      wysiwygAdapter.value.applyExternalRevision(snapshot.markdown)
    }
  }

  const incoming = navigation.selection as Partial<SourceEditorSelectionSnapshot> | Partial<WysiwygSelectionSnapshot> | undefined
  if (incoming && 'selection' in incoming && incoming.selection) {
    wysiwygAdapter.value.restoreSelection({
      ...(incoming.cursor ? { cursor: incoming.cursor } : {}),
      selection: incoming.selection,
      ...(navigation.scrollTop !== undefined ? { scrollTop: navigation.scrollTop } : {})
    })
  } else if (incoming?.cursor) wysiwygAdapter.value.restoreSelection({ cursor: incoming.cursor, ...(navigation.scrollTop !== undefined ? { scrollTop: navigation.scrollTop } : {}) })
  else if (navigation.structuralAnchor) wysiwygAdapter.value.scrollToStructuralAnchor(navigation.structuralAnchor)
  suspendedWysiwyg = null
}

async function activateMode(mode: DocumentMode, snapshot: { markdown: string; revision: number }, navigation: EditorNavigationSnapshot): Promise<void> {
  renderMode.value = mode
  if (mode !== 'wysiwyg') wysiwygSearchOpen.value = false
  await nextTick()
  if (mode === 'source' || mode === 'split') {
    await ensureSource(snapshot, navigation)
    if (mode === 'split' && sourceAdapter.value) pendingSplitAnchor = sourceAdapter.value.captureStructuralAnchor()
  }
  else if (mode === 'wysiwyg') await ensureWysiwyg(snapshot, navigation)
  else if (navigation.structuralAnchor) previewPane.value?.scrollToStructuralAnchor(navigation.structuralAnchor)
}

async function persistModeDefaults(mode: DocumentMode): Promise<void> {
  const result = await window.markhere.settings.update({ expectedRevision: currentSettings.value.revision, defaultMode: mode })
  if (result.ok) { currentSettings.value = result.data; emit('settingsChanged', result.data) }
}

async function setMode(mode: DocumentMode): Promise<void> {
  documents.setMode(props.documentId, mode)
  await persistModeDefaults(mode)
}

function createController(): ModeController {
  return new ModeController(session.value.view.mode, {
    getCanonicalSnapshot: canonicalSnapshot,
    flush,
    commitFlushedMarkdown: commitFlushed,
    capture,
    deactivate: (surface) => { if (surface === 'source') destroySource(); else suspendWysiwyg() },
    activate: activateMode,
    setMode,
    onTransitionState: (state) => { transitionState.value = state }
  })
}

async function transition(mode: DocumentMode): Promise<void> {
  if (!controller) return
  try { await controller.transition(mode) }
  catch (error) {
    emit('error', error instanceof WysiwygRoundTripUnsafeError ? error.message : error instanceof Error ? error.message : 'Mode transition failed.')
  }
}

async function flushActiveEditable(): Promise<{ markdown: string; revision: number }> {
  return controller?.flushActiveEditable() ?? canonicalSnapshot()
}

function executeEditorCommand(command: EditorCommandId): boolean {
  if (renderMode.value === 'preview') return false
  if (renderMode.value === 'wysiwyg') return wysiwygAdapter.value?.execute(command) ?? false
  return sourceAdapter.value?.execute(command) ?? false
}

function undo(): boolean { return executeEditorCommand('history.undo') }
function redo(): boolean { return executeEditorCommand('history.redo') }
function find(): boolean {
  if (renderMode.value === 'wysiwyg') {
    wysiwygSearchOpen.value = true
    return true
  }
  return executeEditorCommand('search.find')
}
function replace(): boolean {
  if (renderMode.value === 'wysiwyg') {
    wysiwygSearchOpen.value = true
    return true
  }
  return executeEditorCommand('search.replace')
}
function runWysiwygSearch(): void { wysiwygAdapter.value?.search(wysiwygSearchQuery.value) }
function findWysiwyg(direction: 'next' | 'previous'): void {
  if (!wysiwygSearchQuery.value) runWysiwygSearch()
  if (direction === 'next') wysiwygAdapter.value?.findNext()
  else wysiwygAdapter.value?.findPrevious()
}
function replaceWysiwyg(all: boolean): void {
  if (!wysiwygSearchQuery.value) return
  wysiwygAdapter.value?.search(wysiwygSearchQuery.value)
  wysiwygAdapter.value?.replace(wysiwygReplaceValue.value, all)
}

async function updateSplitPreference(patch: { splitRatio?: number; syncScroll?: boolean }): Promise<void> {
  documents.updateSplitView(props.documentId, {
    ...(patch.splitRatio !== undefined ? { ratio: patch.splitRatio } : {}),
    ...(patch.syncScroll !== undefined ? { syncScroll: patch.syncScroll } : {})
  })
  const result = await window.markhere.settings.update({
    expectedRevision: currentSettings.value.revision,
    ...(patch.splitRatio !== undefined ? { splitRatio: patch.splitRatio } : {}),
    ...(patch.syncScroll !== undefined ? { syncScroll: patch.syncScroll } : {})
  })
  if (result.ok) { currentSettings.value = result.data; emit('settingsChanged', result.data) }
}

function startDividerDrag(event: PointerEvent): void {
  const container = splitContainer.value
  if (!container) return
  event.preventDefault()
  const move = (moveEvent: PointerEvent): void => {
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0) return
    const raw = (moveEvent.clientX - rect.left) / rect.width
    const ratio = Math.min(0.85, Math.max(0.15, raw))
    documents.updateSplitView(props.documentId, { ratio })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    dividerCleanup = null
    void updateSplitPreference({ splitRatio: session.value.view.split.ratio })
  }
  dividerCleanup?.()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
  dividerCleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
}

function forwardOpenedDocument(document: OpenDocumentDTO, anchor?: string): void { emit('openedDocument', document, anchor) }
function forwardActivateExistingDocument(documentId: string, anchor?: string): void { emit('activateExistingDocument', documentId, anchor) }
function toggleSyncScroll(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) void updateSplitPreference({ syncScroll: target.checked })
}

function onPreviewRendered(report: { revision: number }): void {
  documents.updatePreviewView(props.documentId, { renderedRevision: report.revision, renderStatus: 'ready' })
  if (renderMode.value === 'split' && session.value.view.split.syncScroll && pendingSplitAnchor) {
    splitPreviewPane.value?.scrollToStructuralAnchor(pendingSplitAnchor)
    pendingSplitAnchor = null
  }
}

watch(() => [session.value.buffer.revision, session.value.buffer.markdown] as const, ([revision, markdown]) => {
  const mutationSource = session.value.buffer.lastMutation?.source
  const authoritative = mutationSource === 'reload' || mutationSource === 'recovery' || mutationSource === 'system'
  if (authoritative) suspendedWysiwyg = null
  if (sourceAdapter.value && sourceAdapter.value.markdown !== markdown) sourceAdapter.value.applyExternalRevision(markdown)
  if (wysiwygAdapter.value && wysiwygAdapter.value.markdown !== markdown) {
    // Source edits intentionally leave the hidden WYSIWYG surface at its last
    // canonical revision so returning to it can create one explicit undo
    // boundary. Authoritative revisions bypass that editor boundary.
    if (renderMode.value === 'wysiwyg' || authoritative) wysiwygAdapter.value.applyExternalRevision(markdown)
  }
  if (renderMode.value === 'split') documents.updateSplitView(props.documentId, { pendingPreviewRevision: revision })
})

watch(() => props.settings, (value) => {
  currentSettings.value = value
  sourceAdapter.value?.setOptions({ lineNumbers: value.lineNumbers })
})

onMounted(async () => {
  // Initialize per-document split preferences from the persisted settings model.
  documents.updateSplitView(props.documentId, { ratio: currentSettings.value.splitRatio, syncScroll: currentSettings.value.syncScroll })
  controller = createController()
  try { await activateMode(session.value.view.mode, canonicalSnapshot(), {}) }
  catch (error) {
    emit('error', error instanceof Error ? error.message : 'Initial editor mode failed.')
    renderMode.value = 'source'
    documents.setMode(props.documentId, 'source')
    await activateMode('source', canonicalSnapshot(), {})
    controller = createController()
  }
})

onBeforeUnmount(() => {
  dividerCleanup?.()
  destroySource()
  destroyWysiwyg()
})

defineExpose({ transition, flushActiveEditable, executeEditorCommand, undo, redo, find, replace, transitions: ALL_MODE_TRANSITIONS })
</script>

<template>
  <section class="document-editor" :data-mode="renderMode">
    <header class="editor-toolbar">
      <div class="mode-switcher" role="group" aria-label="Editor mode">
        <button
          v-for="item in modeButtons"
          :key="item.mode"
          type="button"
          :class="{ active: renderMode === item.mode }"
          :aria-pressed="renderMode === item.mode"
          :disabled="transitionState !== 'idle'"
          :title="`${item.label} (${item.shortcut})`"
          @click="transition(item.mode)"
        >{{ item.label }}</button>
      </div>
      <div class="format-toolbar" role="toolbar" aria-label="Markdown formatting">
        <button v-for="item in formatButtons" :key="item.id" type="button" :disabled="renderMode === 'preview'" @click="executeEditorCommand(item.id)">{{ item.label }}</button>
        <button type="button" :disabled="renderMode === 'preview'" @click="undo">Undo</button>
        <button type="button" :disabled="renderMode === 'preview'" @click="redo">Redo</button>
        <button type="button" :disabled="renderMode === 'preview'" @click="find">Find</button>
        <button type="button" :disabled="renderMode === 'preview'" @click="replace">Replace</button>
      </div>
      <span class="transition-state">{{ transitionState }}</span>
    </header>

    <form v-if="renderMode === 'wysiwyg' && wysiwygSearchOpen" class="wysiwyg-search" @submit.prevent="runWysiwygSearch">
      <label>Find <input v-model="wysiwygSearchQuery" type="search" @input="runWysiwygSearch"></label>
      <label>Replace <input v-model="wysiwygReplaceValue" type="text"></label>
      <button type="button" @click="findWysiwyg('previous')">Previous</button>
      <button type="button" @click="findWysiwyg('next')">Next</button>
      <button type="button" @click="replaceWysiwyg(false)">Replace</button>
      <button type="button" @click="replaceWysiwyg(true)">Replace all</button>
      <button type="button" @click="wysiwygSearchOpen = false">Close</button>
    </form>

    <div v-show="renderMode === 'wysiwyg'" class="editor-pane wysiwyg-pane">
      <div ref="wysiwygHost" class="wysiwyg-host" aria-label="WYSIWYG Markdown editor"></div>
    </div>

    <PreviewPane
      v-if="renderMode === 'preview'"
      ref="previewPane"
      fill
      :document-id="session.id"
      :markdown="session.buffer.markdown"
      :revision="session.buffer.revision"
      :resource-scope-id="session.resourceScope.documentResourceScopeId"
      :requested-anchor="requestedAnchor"
      @opened-document="forwardOpenedDocument"
      @activate-existing-document="forwardActivateExistingDocument"
      @anchor-consumed="emit('anchorConsumed')"
      @rendered="onPreviewRendered"
    />

    <div v-if="renderMode === 'source' || renderMode === 'split'" ref="splitContainer" class="source-layout" :class="{ split: renderMode === 'split' }">
      <section class="editor-pane source-pane" :style="renderMode === 'split' ? { width: `${session.view.split.ratio * 100}%` } : undefined">
        <div ref="sourceHost" class="source-host" aria-label="Markdown source editor"></div>
      </section>
      <template v-if="renderMode === 'split'">
        <div class="split-divider" role="separator" aria-orientation="vertical" tabindex="0" @pointerdown="startDividerDrag"></div>
        <section class="split-preview" :style="{ width: `${(1 - session.view.split.ratio) * 100}%` }">
          <div class="split-options">
            <label><input type="checkbox" :checked="session.view.split.syncScroll" @change="toggleSyncScroll"> Sync scroll</label>
          </div>
          <PreviewPane
            ref="splitPreviewPane"
            fill
            :document-id="session.id"
            :markdown="session.buffer.markdown"
            :revision="session.buffer.revision"
            :resource-scope-id="session.resourceScope.documentResourceScopeId"
            :requested-anchor="requestedAnchor"
            @scroll-anchor="syncFromPreview"
            @opened-document="forwardOpenedDocument"
            @activate-existing-document="forwardActivateExistingDocument"
            @anchor-consumed="emit('anchorConsumed')"
            @rendered="onPreviewRendered"
          />
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.document-editor { margin-top: 18px; border: 1px solid #303a50; border-radius: 12px; overflow: hidden; background: #10151f; }
.editor-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 9px 10px; border-bottom: 1px solid #303a50; background: #171e2b; }
.mode-switcher, .format-toolbar { display: flex; flex-wrap: wrap; gap: 5px; }
.editor-toolbar button { padding: 6px 9px; font-size: 12px; }
.editor-toolbar button.active { background: #31558b; border-color: #6ca0ee; }
.editor-toolbar button:disabled { cursor: not-allowed; opacity: .45; }
.transition-state { margin-left: auto; color: #8090ae; font-size: 11px; }
.wysiwyg-search { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #303a50; background: #131a26; color: #dbe6f8; font-size: 12px; }
.wysiwyg-search label { display: flex; align-items: center; gap: 5px; }
.wysiwyg-search input { min-width: 150px; padding: 5px 7px; }
.editor-pane { min-height: 440px; height: min(62vh, 720px); overflow: hidden; background: #fff; color: #1f2328; }
.source-host, .wysiwyg-host { height: 100%; overflow: auto; }
.source-layout { display: flex; min-height: 440px; height: min(62vh, 720px); }
.source-layout:not(.split) .source-pane { width: 100%; }
.split .source-pane { flex: 0 0 auto; }
.split-divider { width: 7px; flex: 0 0 7px; cursor: col-resize; background: #2c374c; border-left: 1px solid #46536d; border-right: 1px solid #46536d; }
.split-divider:focus-visible { outline: 2px solid #8bb4ff; z-index: 2; }
.split-preview { min-width: 0; height: 100%; overflow: hidden; background: #fff; }
.split-preview :deep(.preview-panel) { height: calc(100% - 30px); margin: 0; border: 0; border-radius: 0; }
.split-preview :deep(.mh-preview) { max-height: none; height: calc(100% - 36px); }
.split-options { height: 30px; padding: 5px 10px; color: #44516a; background: #f2f4f8; border-bottom: 1px solid #d8dee8; font-size: 12px; }
.wysiwyg-host :deep(.mu-container), .wysiwyg-host :deep(.mu-editor) { min-height: 100%; }
</style>
