<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OpenDocumentDTO } from '@markhere/ipc-contract'
import {
  PreviewRenderCoordinator,
  PreviewRenderer,
  type PreviewRenderReport,
  type PreviewLinkResolution
} from '@markhere/preview-renderer'

const props = defineProps<{
  documentId: string
  markdown: string
  revision: number
  resourceScopeId: string | null
  requestedAnchor?: string | null
}>()

const emit = defineEmits<{
  openedDocument: [document: OpenDocumentDTO, anchor?: string]
  activateExistingDocument: [documentId: string, anchor?: string]
  anchorConsumed: []
}>() 

const root = ref<HTMLElement | null>(null)
const report = ref<PreviewRenderReport | null>(null)
const renderStatus = ref<'idle' | 'scheduled' | 'rendered' | 'failed'>('idle')
const coordinator = new PreviewRenderCoordinator(150)
let renderer: PreviewRenderer | null = null
let rendererKey = ''

function createRenderer(): PreviewRenderer | null {
  const target = root.value
  if (!target) return null
  const key = `${props.documentId}:${props.resourceScopeId ?? 'no-resource-scope'}`
  if (renderer && rendererKey === key) return renderer
  renderer?.destroy()
  rendererKey = key
  renderer = new PreviewRenderer(target, {
    documentId: props.documentId,
    resourceScopeId: props.resourceScopeId ?? '',
    allowRemoteHttpsImages: false,
    resolveLink: async (href): Promise<PreviewLinkResolution> => {
      const result = await window.markhere.resources.resolveLink({ documentId: props.documentId, href })
      return result.ok ? result.data : { kind: 'blocked', reason: result.error.code }
    },
    openDocumentToken: async (openToken, anchor, existingDocumentId) => {
      if (existingDocumentId) {
        emit('activateExistingDocument', existingDocumentId, anchor)
        return
      }
      const result = await window.markhere.files.openSelected(openToken)
      if (result.ok) emit('openedDocument', result.data, anchor)
    },
    openExternal: async (url) => {
      await window.markhere.shell.openExternal(url)
    }
  })
  return renderer
}

function scheduleRender(): void {
  const active = createRenderer()
  if (!active) return
  renderStatus.value = 'scheduled'
  void coordinator.schedule(
    { documentId: props.documentId, revision: props.revision, markdown: props.markdown },
    async (request, signal) => {
      const latest = createRenderer()
      if (!latest) return
      const nextReport = await latest.render(
        { markdown: request.markdown, revision: request.revision },
        signal
      )
      if (!signal.aborted && request.revision === props.revision && request.documentId === props.documentId) {
        report.value = nextReport
        consumeRequestedAnchor(true)
      }
    }
  ).then((outcome) => {
    if (outcome === 'rendered') renderStatus.value = 'rendered'
    else if (outcome === 'failed') renderStatus.value = 'failed'
  })
}

onMounted(async () => {
  await nextTick()
  scheduleRender()
})

watch(
  () => [props.documentId, props.resourceScopeId, props.revision, props.markdown] as const,
  () => scheduleRender()
)

function consumeRequestedAnchor(consumeWhenMissing = false): void {
  const anchor = props.requestedAnchor
  if (!anchor) return
  const anchorTarget = root.value?.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`) ?? null
  if (anchorTarget) {
    anchorTarget.scrollIntoView({ block: 'start' })
    emit('anchorConsumed')
  } else if (consumeWhenMissing) {
    emit('anchorConsumed')
  }
}

watch(() => props.requestedAnchor, () => consumeRequestedAnchor(false))

onBeforeUnmount(() => {
  coordinator.cancel()
  renderer?.destroy()
  renderer = null
})
</script>

<template>
  <section class="preview-panel" aria-label="Read-only Markdown preview">
    <header class="preview-status">
      <span>Preview • revision {{ revision }}</span>
      <span>{{ renderStatus }}</span>
      <span v-if="report">{{ report.headings.length }} headings • {{ report.diagnostics.length }} diagnostics</span>
    </header>
    <article ref="root" class="mh-preview" tabindex="0" aria-live="polite"></article>
  </section>
</template>

<style scoped>
.preview-panel { margin-top: 20px; border: 1px solid #303a50; border-radius: 12px; overflow: hidden; background: #fdfdfd; color: #1f2328; }
.preview-status { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #d8dee8; background: #f2f4f8; color: #526075; font-size: 12px; }
.mh-preview { min-height: 240px; max-height: 520px; overflow: auto; padding: 28px; outline: none; }
.mh-preview:focus-visible { box-shadow: inset 0 0 0 2px #3b82f6; }
</style>
