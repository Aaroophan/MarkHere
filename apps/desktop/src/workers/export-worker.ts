import { renderDocx } from '@markhere/export-docx'
import { renderStandaloneHtml } from '@markhere/export-html'
import { buildPdfPrintDocument } from '@markhere/export-pdf'
import type { ExportAsset, ExportRenderContext } from '@markhere/export-core'
import type { ExportWorkerRequest, ExportWorkerResponse } from './export-worker-protocol'

interface ParentPort {
  on(event: 'message', listener: (event: { data: ExportWorkerRequest }) => void): void
  postMessage(message: ExportWorkerResponse): void
}

const parentPort = (process as typeof process & { parentPort?: ParentPort }).parentPort
if (!parentPort) throw new Error('MarkHere export worker requires an Electron utility-process parent port.')

function context(document: ExportWorkerRequest['document'], assets: readonly ExportAsset[]): ExportRenderContext {
  return { document, assets: new Map(assets.map((asset) => [asset.source, asset])) }
}

parentPort.on('message', (event) => {
  const request = event.data
  void (async () => {
    try {
      if (request.type === 'render-html') {
        const rendered = renderStandaloneHtml(context(request.document, request.assets), request.options)
        parentPort.postMessage({ type: 'result', requestId: request.requestId, html: rendered.html, diagnostics: rendered.diagnostics })
        return
      }
      if (request.type === 'render-print-html') {
        const rendered = buildPdfPrintDocument(context(request.document, request.assets), request.options)
        parentPort.postMessage({ type: 'result', requestId: request.requestId, html: rendered.html, diagnostics: rendered.diagnostics })
        return
      }
      const rendered = await renderDocx(context(request.document, request.assets), request.options)
      parentPort.postMessage({ type: 'result', requestId: request.requestId, bytes: rendered.bytes, diagnostics: rendered.diagnostics })
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        requestId: request.requestId,
        code: 'EXPORT_WORKER_FAILED',
        message: 'Export worker failed.'
      })
    }
  })()
})
