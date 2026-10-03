import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const errors = []
async function text(path) { return readFile(join(root, path), 'utf8') }
function requireText(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) errors.push(`${label}: missing ${fragment}`)
}

const required = [
  'packages/export-core/src/index.ts',
  'packages/export-html/src/index.ts',
  'packages/export-pdf/src/index.ts',
  'packages/export-docx/src/index.ts',
  'apps/desktop/src/main/export/export-coordinator.ts',
  'apps/desktop/src/main/export/export-asset-resolver.ts',
  'apps/desktop/src/main/export/export-temp-storage.ts',
  'apps/desktop/src/main/export/export-worker-client.ts',
  'apps/desktop/src/main/export/pdf-print-surface.ts',
  'apps/desktop/src/main/export/print-document-store.ts',
  'apps/desktop/src/workers/export-worker.ts',
  'apps/desktop/src/renderer/src/components/ExportDialog.vue'
]
for (const path of required) {
  try { await access(join(root, path)) } catch { errors.push(`missing ${path}`) }
}

const [core, html, pdf, docx, coordinator, assets, temp, workerClient, worker, print, windows, protocol, ipc, bridge, preload, dialog, app, vite, schemas] = await Promise.all([
  text('packages/export-core/src/index.ts'),
  text('packages/export-html/src/index.ts'),
  text('packages/export-pdf/src/index.ts'),
  text('packages/export-docx/src/index.ts'),
  text('apps/desktop/src/main/export/export-coordinator.ts'),
  text('apps/desktop/src/main/export/export-asset-resolver.ts'),
  text('apps/desktop/src/main/export/export-temp-storage.ts'),
  text('apps/desktop/src/main/export/export-worker-client.ts'),
  text('apps/desktop/src/workers/export-worker.ts'),
  text('apps/desktop/src/main/export/pdf-print-surface.ts'),
  text('apps/desktop/src/main/windows/window-manager.ts'),
  text('apps/desktop/src/main/protocols/app-protocol.ts'),
  text('apps/desktop/src/main/ipc/register-ipc.ts'),
  text('packages/ipc-contract/src/bridge.ts'),
  text('apps/desktop/src/preload/bridge.ts'),
  text('apps/desktop/src/renderer/src/components/ExportDialog.vue'),
  text('apps/desktop/src/renderer/src/App.vue'),
  text('apps/desktop/electron.vite.config.ts'),
  text('packages/ipc-contract/src/schemas.ts')
])

requireText(core, [
  'interface ExportSnapshot', 'createExportSnapshot', 'schemaVersion: 1', 'buildExportDocument',
  "kind: 'heading'", "kind: 'paragraph'", "kind: 'list'", "kind: 'table'", "kind: 'code-block'",
  "kind: 'blockquote'", "kind: 'image'", "kind: 'diagram'", "kind: 'math-block'", "kind: 'thematic-break'",
  'parseMarkdown({ markdown: snapshot.markdown', 'MARKHERE_MARKDOWN_PROFILE'
], 'shared export IR')
if (/IMPLEMENTATION_STATUS\s*=\s*['"]planned['"]/u.test(core + html + pdf + docx)) errors.push('export package still reports planned implementation status')

requireText(html, [
  'renderStandaloneHtml', 'renderPrintHtml', '<!doctype html>', 'charset="utf-8"', 'sanitizeHtml(',
  "allowedSchemes: ['https', 'mailto']", "default-src 'none'", 'EXPORT_MERMAID_SOURCE_FALLBACK', 'renderMath('
], 'HTML exporter')

requireText(pdf, [
  'createPdfPrintOptions', 'displayHeaderFooter', 'generateTaggedPDF: true', 'generateDocumentOutline: true',
  'safeHeaderFooterTemplate', 'verifyPdfBytes', '/Root\\b', 'startxref\\s+', 'atXref.startsWith'
], 'PDF adapter')

requireText(docx, [
  "from 'docx'", 'HeadingLevel.HEADING_1', 'ExternalHyperlink', 'ImageRun', 'numbering:', 'new Table(',
  "id: 'MarkHereCode'", 'PageNumber.CURRENT', 'DOCX_MERMAID_PNG_FALLBACK_UNAVAILABLE', 'DOCX_MATH_TEXT_FALLBACK',
  "archiveText.includes('[Content_Types].xml')", "archiveText.includes('word/document.xml')"
], 'DOCX exporter')

requireText(coordinator, [
  'class ExportCoordinator', 'createExportSnapshot', '#queue', '#maxConcurrent', 'AbortController',
  "status = 'completed'", 'resolving-assets', 'commitFinal', 'selection', 'sourceRevision',
  'cancelAllForWebContents', 'scheduleRetention', 'job.committing = true'
], 'export coordinator')
if (/future\.unavailable\([^)]*exports/u.test(ipc)) errors.push('export IPC still routes through FutureService')
requireText(ipc, ['services.exports.start', 'services.exports.print', 'services.exports.getStatus', 'services.exports.cancel'], 'export IPC')
requireText(bridge, ['start(request: StartExportRequest)', 'print(request: PrintRequest)', 'cancel(jobId: string)', 'getStatus(jobId: string)'], 'semantic export bridge contract')
requireText(preload, ['exportStart', 'exportPrint', 'exportCancel', 'exportGetStatus'], 'preload export bridge')
requireText(schemas, ['StartExportRequestSchema', 'PrintRequestSchema', 'PdfExportOptionsSchema', 'DocxExportOptionsSchema'], 'runtime export schemas')

requireText(assets, ['resolveExportResource', 'ownsDocumentScope', 'collectImageSources', '16 * 1024 * 1024', 'EXPORT_REMOTE_IMAGE_NOT_EMBEDDED'], 'export resource resolver')
requireText(temp, ["join(tempRoot, 'MarkHere', 'exports')", 'cleanupStale', 'atomicReplaceFile', 'result.tmp'], 'export temporary storage')
requireText(workerClient, ['utilityProcess.fork', 'DEFAULT_TIMEOUT_MS', 'signal.addEventListener', 'child.kill()'], 'utility-process export worker client')
requireText(worker, ['renderStandaloneHtml', 'buildPdfPrintDocument', 'renderDocx', 'process as typeof process & { parentPort?: ParentPort }'], 'export worker entry')
requireText(vite, ["'export-worker': resolve", "'@markhere/export-docx'", "'@markhere/export-pdf'"], 'desktop build configuration')

requireText(print, ['createPrintWindow()', 'printToPDF(createPdfPrintOptions(options))', 'webContents.print({', 'markhere://print/'], 'PDF/print surface')
requireText(windows, ['createPrintWindow(): BrowserWindow', 'nodeIntegration: false', 'contextIsolation: true', 'sandbox: true', 'devTools: false', "setWindowOpenHandler(() => ({ action: 'deny' }))"], 'hardened print BrowserWindow')
requireText(protocol, ["parsed.host === 'print'", "script-src 'none'", "connect-src 'none'", "img-src data:"], 'controlled print protocol')
if (/\.loadFile\s*\(/u.test(print + windows)) errors.push('print surface must not load file:// application pages')

requireText(dialog, ['role="dialog"', 'Revision {{ snapshot.revision }} is frozen for this job.', 'onExportProgress', 'onExportCompleted', 'exports.cancel', 'chooseExportTarget', 'Print document'], 'unified export dialog')
requireText(app, ["openExportDialog('html')", "openExportDialog('pdf')", "openExportDialog('docx')", "openExportDialog('print')", 'flushActiveEditable()', 'ExportDialog'], 'renderer export commands')

if (errors.length) {
  console.error(`Issue-7 unified export violations:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}
console.log('Issue-7 unified HTML/PDF/DOCX/printing architecture structure OK')
