import type { BrowserWindow } from 'electron'
import type { PdfExportOptions } from '@markhere/export-core'
import { createPdfPrintOptions, verifyPdfBytes } from '@markhere/export-pdf'
import type { WindowManager } from '../windows/window-manager'
import type { PrintDocumentStore } from './print-document-store'

function mmToPixels(mm: number): number { return Math.round(mm * 96 / 25.4) }

export class PdfPrintSurface {
  readonly #windows = new Map<string, BrowserWindow>()
  readonly #windowManager: WindowManager
  readonly #documents: PrintDocumentStore

  constructor(windowManager: WindowManager, documents: PrintDocumentStore) {
    this.#windowManager = windowManager
    this.#documents = documents
  }

  async renderPdf(jobId: string, html: string, options: PdfExportOptions, signal: AbortSignal): Promise<Uint8Array> {
    const window = await this.#load(jobId, html, signal)
    try {
      const data = await this.#withAbort(window.webContents.printToPDF(createPdfPrintOptions(options)), signal, () => window.destroy())
      const bytes = new Uint8Array(data)
      if (!verifyPdfBytes(bytes)) throw new Error('EXPORT_PDF_VERIFICATION_FAILED')
      return bytes
    } finally { this.#destroy(jobId) }
  }

  async print(jobId: string, html: string, options: PdfExportOptions, signal: AbortSignal): Promise<void> {
    const window = await this.#load(jobId, html, signal)
    try {
      await this.#withAbort(new Promise<void>((resolve, reject) => {
        window.webContents.print({
          silent: false,
          printBackground: options.printBackground,
          landscape: options.orientation === 'landscape',
          pageSize: options.pageSize,
          margins: {
            marginType: 'custom',
            top: mmToPixels(options.marginsMm.top),
            right: mmToPixels(options.marginsMm.right),
            bottom: mmToPixels(options.marginsMm.bottom),
            left: mmToPixels(options.marginsMm.left)
          },
          ...(options.displayHeaderFooter && options.headerTemplate ? { header: options.headerTemplate } : {}),
          ...(options.displayHeaderFooter && options.footerTemplate ? { footer: options.footerTemplate } : {})
        }, (success, failureReason) => {
          if (success) resolve()
          else if (/cancel/iu.test(failureReason ?? '')) reject(new DOMException('Print cancelled.', 'AbortError'))
          else reject(new Error(failureReason || 'Print failed.'))
        })
      }), signal, () => window.destroy())
    } finally { this.#destroy(jobId) }
  }

  cancel(jobId: string): void { this.#destroy(jobId) }
  closeAll(): void { for (const jobId of [...this.#windows.keys()]) this.#destroy(jobId); this.#documents.clear() }

  async #load(jobId: string, html: string, signal: AbortSignal): Promise<BrowserWindow> {
    if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError')
    this.#documents.put(jobId, html)
    const window = this.#windowManager.createPrintWindow()
    this.#windows.set(jobId, window)
    const onAbort = (): void => window.destroy()
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      await window.loadURL(`markhere://print/${jobId}`)
      if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError')
      return window
    } catch (error) {
      this.#destroy(jobId)
      throw error
    } finally { signal.removeEventListener('abort', onAbort) }
  }

  #destroy(jobId: string): void {
    const window = this.#windows.get(jobId)
    this.#windows.delete(jobId)
    this.#documents.delete(jobId)
    if (window && !window.isDestroyed()) window.destroy()
  }

  async #withAbort<T>(promise: Promise<T>, signal: AbortSignal, onAbort: () => void): Promise<T> {
    if (signal.aborted) { onAbort(); throw new DOMException('Export cancelled.', 'AbortError') }
    return await new Promise<T>((resolve, reject) => {
      const abort = (): void => { onAbort(); reject(new DOMException('Export cancelled.', 'AbortError')) }
      signal.addEventListener('abort', abort, { once: true })
      promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value) }, (error) => { signal.removeEventListener('abort', abort); reject(error) })
    })
  }
}
