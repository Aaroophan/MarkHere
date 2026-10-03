<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  DocxExportOptions,
  ExportCompletedEvent,
  ExportJobKind,
  ExportProgressEvent,
  ExportSnapshotRequestBase,
  HtmlExportOptions,
  PdfExportOptions,
} from '@markhere/ipc-contract'

const props = defineProps<{ open: boolean; initialFormat: ExportJobKind; snapshot: ExportSnapshotRequestBase | null }>()
const emit = defineEmits<{ close: []; error: [code: string]; completed: [event: ExportCompletedEvent] }>()
const format = ref<ExportJobKind>(props.initialFormat)
const jobId = ref<string | null>(null)
const phase = ref('')
const percent = ref(0)
const completed = ref<ExportCompletedEvent | null>(null)
const starting = ref(false)
const includeFrontMatter = ref(false)
const includeToc = ref(false)
const imagePolicy = ref<'embed-local' | 'reference'>('embed-local')
const pageSize = ref<'A4' | 'A3' | 'Letter' | 'Legal'>('A4')
const orientation = ref<'portrait' | 'landscape'>('portrait')
const marginMm = ref(15)
const printBackground = ref(true)
const displayHeaderFooter = ref(false)
const headerText = ref('')
const footerText = ref('')
const includePageNumbers = ref(true)
const codeStyle = ref<'shaded' | 'plain'>('shaded')
const diagramMode = ref<'svg-if-compatible' | 'png'>('png')
const mathMode = ref<'image' | 'text-fallback'>('text-fallback')
const unsubscribers: Array<() => void> = []

const running = computed(() => !!jobId.value && !completed.value)
const dialogTitle = computed(() => format.value === 'print' ? 'Print document' : `Export ${format.value.toUpperCase()}`)

watch(() => [props.open, props.initialFormat] as const, ([open, next]) => {
  if (!open) return
  format.value = next
  jobId.value = null
  completed.value = null
  phase.value = ''
  percent.value = 0
})

function common() {
  return {
    themeId: 'default',
    includeFrontMatter: includeFrontMatter.value,
    includeTableOfContents: includeToc.value,
    ...(props.snapshot?.title ? { documentTitle: props.snapshot.title } : {})
  }
}

function pdfOptions(): PdfExportOptions {
  return {
    ...common(),
    pageSize: pageSize.value,
    orientation: orientation.value,
    marginsMm: { top: marginMm.value, right: marginMm.value, bottom: marginMm.value, left: marginMm.value },
    printBackground: printBackground.value,
    displayHeaderFooter: displayHeaderFooter.value,
    ...(headerText.value.trim() ? { headerTemplate: headerText.value.trim() } : {}),
    ...(footerText.value.trim() ? { footerTemplate: footerText.value.trim() } : {})
  }
}

async function start(): Promise<void> {
  const snapshot = props.snapshot
  if (!snapshot || running.value || starting.value) return
  starting.value = true
  completed.value = null
  try {
    const base = { ...snapshot }
    if (format.value === 'print') {
      const result = await window.markhere.exports.print({ ...base, options: pdfOptions() })
      if (!result.ok) { emit('error', result.error.code); return }
      jobId.value = result.data.jobId
      return
    }
    const target = await window.markhere.dialogs.chooseExportTarget({
      format: format.value,
      defaultName: `${snapshot.title.replace(/\.[^.]+$/u, '')}.${format.value}`
    })
    if (!target.ok) { emit('error', target.error.code); return }
    if (!target.data) return
    if (format.value === 'html') {
      const options: HtmlExportOptions = { ...common(), imagePolicy: imagePolicy.value }
      const result = await window.markhere.exports.start({ ...base, format: 'html', options, targetSelectionToken: target.data.selectionToken })
      if (!result.ok) { emit('error', result.error.code); return }
      jobId.value = result.data.jobId
    } else if (format.value === 'pdf') {
      const result = await window.markhere.exports.start({ ...base, format: 'pdf', options: pdfOptions(), targetSelectionToken: target.data.selectionToken })
      if (!result.ok) { emit('error', result.error.code); return }
      jobId.value = result.data.jobId
    } else {
      const options: DocxExportOptions = {
        ...common(), pageSize: pageSize.value === 'Letter' ? 'Letter' : 'A4', orientation: orientation.value,
        includePageNumbers: includePageNumbers.value, codeStyle: codeStyle.value, diagramMode: diagramMode.value, mathMode: mathMode.value
      }
      const result = await window.markhere.exports.start({ ...base, format: 'docx', options, targetSelectionToken: target.data.selectionToken })
      if (!result.ok) { emit('error', result.error.code); return }
      jobId.value = result.data.jobId
    }
  } finally { starting.value = false }
}

function cancel(): void { if (jobId.value) window.markhere.exports.cancel(jobId.value) }
function onProgress(event: ExportProgressEvent): void {
  if (event.jobId !== jobId.value) return
  phase.value = event.progress.messageKey ?? event.progress.phase
  percent.value = Math.round(event.progress.percent ?? 0)
}
function onCompleted(event: ExportCompletedEvent): void {
  if (event.jobId !== jobId.value) return
  completed.value = event
  percent.value = event.success ? 100 : percent.value
  emit('completed', event)
}
function close(): void { if (!running.value) emit('close') }

onMounted(() => {
  unsubscribers.push(window.markhere.events.onExportProgress(onProgress))
  unsubscribers.push(window.markhere.events.onExportCompleted(onCompleted))
})
onBeforeUnmount(() => { for (const unsubscribe of unsubscribers) unsubscribe() })
</script>

<template>
  <div v-if="open" class="export-scrim" @mousedown.self="close">
    <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header><div><h2 id="export-title">{{ dialogTitle }}</h2><p v-if="snapshot">Revision {{ snapshot.revision }} is frozen for this job.</p></div><button type="button" aria-label="Close export dialog" :disabled="running" @click="close">×</button></header>
      <label>Format <select v-model="format" :disabled="running"><option value="html">HTML</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="print">Print</option></select></label>
      <div class="checks"><label><input v-model="includeFrontMatter" type="checkbox" :disabled="running"> Include front matter</label><label><input v-model="includeToc" type="checkbox" :disabled="running"> Include table of contents</label></div>
      <label v-if="format === 'html'">Local images <select v-model="imagePolicy" :disabled="running"><option value="embed-local">Embed</option><option value="reference">Reference</option></select></label>
      <template v-if="format === 'pdf' || format === 'print' || format === 'docx'">
        <div class="grid"><label>Page size <select v-model="pageSize" :disabled="running"><option>A4</option><option v-if="format !== 'docx'">A3</option><option>Letter</option><option v-if="format !== 'docx'">Legal</option></select></label><label>Orientation <select v-model="orientation" :disabled="running"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div>
      </template>
      <template v-if="format === 'pdf' || format === 'print'">
        <label>Margins (mm) <input v-model.number="marginMm" type="number" min="0" max="50" step="1" :disabled="running"></label>
        <div class="checks"><label><input v-model="printBackground" type="checkbox" :disabled="running"> Print backgrounds</label><label><input v-model="displayHeaderFooter" type="checkbox" :disabled="running"> Header/footer</label></div>
        <div v-if="displayHeaderFooter" class="grid"><label>Header text <input v-model="headerText" maxlength="4096" :disabled="running"></label><label>Footer text <input v-model="footerText" maxlength="4096" :disabled="running"></label></div>
      </template>
      <template v-if="format === 'docx'">
        <div class="checks"><label><input v-model="includePageNumbers" type="checkbox" :disabled="running"> Page numbers</label></div>
        <div class="grid"><label>Code style <select v-model="codeStyle" :disabled="running"><option value="shaded">Shaded</option><option value="plain">Plain</option></select></label><label>Diagram mode <select v-model="diagramMode" :disabled="running"><option value="png">PNG/fallback</option><option value="svg-if-compatible">SVG if compatible</option></select></label><label>Math mode <select v-model="mathMode" :disabled="running"><option value="text-fallback">Text fallback</option><option value="image">Image/fallback</option></select></label></div>
      </template>
      <div v-if="running || completed" class="progress" aria-live="polite"><progress :value="percent" max="100"></progress><span>{{ completed ? (completed.success ? 'Completed' : completed.cancelled ? 'Cancelled' : completed.errorCode ?? 'Failed') : `${phase || 'Preparing'} · ${percent}%` }}</span><p v-if="completed?.displayPath">{{ completed.displayPath }}</p><p v-if="completed?.diagnosticCodes?.length">Warnings: {{ completed.diagnosticCodes.join(', ') }}</p></div>
      <footer><button v-if="running" type="button" @click="cancel">Cancel</button><button v-else type="button" @click="start">{{ format === 'print' ? 'Print…' : 'Export…' }}</button><button type="button" :disabled="running" @click="close">Close</button></footer>
    </section>
  </div>
</template>

<style scoped>
.export-scrim { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / .42); }.export-dialog { width: min(680px, 100%); max-height: 88vh; overflow: auto; display: grid; gap: 14px; padding: 18px; border: 1px solid var(--mh-border); border-radius: 10px; background: var(--mh-panel); color: var(--mh-text); box-shadow: 0 20px 60px var(--mh-shadow); }.export-dialog header,.export-dialog footer { display: flex; justify-content: space-between; align-items: start; gap: 12px; }.export-dialog h2 { margin: 0; }.export-dialog header p { margin: 4px 0 0; color: var(--mh-muted); font-size: 12px; }.export-dialog label { display: grid; gap: 5px; }.checks { display: flex; flex-wrap: wrap; gap: 16px; }.checks label { display: flex; align-items: center; gap: 7px; }.grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.progress { display: grid; gap: 7px; padding: 10px; border: 1px solid var(--mh-border); border-radius: 7px; background: var(--mh-panel-alt); }.progress progress { width: 100%; }.progress p { margin: 0; overflow-wrap: anywhere; color: var(--mh-muted); font-size: 12px; }.export-dialog footer { justify-content: flex-end; }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
