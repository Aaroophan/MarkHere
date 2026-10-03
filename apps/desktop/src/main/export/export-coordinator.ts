import { randomUUID } from 'node:crypto'
import type {
  ApiResult,
  DocxExportOptions as IpcDocxOptions,
  ExportCompletedEvent,
  ExportJobDTO,
  ExportProgress,
  ExportProgressEvent,
  ExportSnapshotRequestBase,
  HtmlExportOptions as IpcHtmlOptions,
  PdfExportOptions as IpcPdfOptions,
  PrintRequest,
  StartExportRequest
} from '@markhere/ipc-contract'
import {
  buildExportDocument,
  createExportSnapshot,
  defaultCapabilityProfile,
  type DocxExportOptions,
  type ExportResultDiagnostic,
  type ExportSnapshot,
  type HtmlExportOptions,
  type PdfExportOptions
} from '@markhere/export-core'
import { verifyDocxBytes } from '@markhere/export-docx'
import type { CapabilityOwnershipRegistry } from '../security/capability-ownership-registry'
import type { SelectionTokenStore } from '../services/selection-token-store'
import { failure, ok } from '../services/api-results'
import type { ExportAssetResolver } from './export-asset-resolver'
import type { ExportTempStorage } from './export-temp-storage'
import type { ExportWorkerClient } from './export-worker-client'
import type { PdfPrintSurface } from './pdf-print-surface'

type JobKind = StartExportRequest['format'] | 'print'

interface RuntimeJob {
  readonly jobId: string
  readonly ownerWebContentsId: number
  readonly kind: JobKind
  readonly snapshot: ExportSnapshot
  readonly targetPath: string | undefined
  readonly options: IpcHtmlOptions | IpcPdfOptions | IpcDocxOptions
  readonly correlationId: string
  readonly controller: AbortController
  readonly startedAt: string
  status: ExportJobDTO['status']
  progress: ExportProgress | undefined
  completedAt: string | undefined
  errorCode: string | undefined
  diagnosticCodes: string[]
  committing: boolean
}

export interface ExportCoordinatorEvents {
  readonly progress: (ownerWebContentsId: number, event: ExportProgressEvent) => void
  readonly completed: (ownerWebContentsId: number, event: ExportCompletedEvent) => void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: unknown })?.name === 'AbortError'
}

function toHtmlOptions(options: IpcHtmlOptions): HtmlExportOptions { return { ...options } }
function toPdfOptions(options: IpcPdfOptions): PdfExportOptions { return { ...options, marginsMm: { ...options.marginsMm } } }
function toDocxOptions(options: IpcDocxOptions): DocxExportOptions { return { ...options } }

export class ExportCoordinator {
  readonly #capabilities: CapabilityOwnershipRegistry
  readonly #selections: SelectionTokenStore
  readonly #assets: ExportAssetResolver
  readonly #temp: ExportTempStorage
  readonly #worker: ExportWorkerClient
  readonly #printSurface: PdfPrintSurface
  readonly #events: ExportCoordinatorEvents
  readonly #jobs = new Map<string, RuntimeJob>()
  readonly #queue: string[] = []
  readonly #maxConcurrent: number
  #active = 0

  constructor(options: {
    capabilities: CapabilityOwnershipRegistry
    selections: SelectionTokenStore
    assets: ExportAssetResolver
    temp: ExportTempStorage
    worker: ExportWorkerClient
    printSurface: PdfPrintSurface
    events: ExportCoordinatorEvents
    maxConcurrent?: number
  }) {
    this.#capabilities = options.capabilities
    this.#selections = options.selections
    this.#assets = options.assets
    this.#temp = options.temp
    this.#worker = options.worker
    this.#printSurface = options.printSurface
    this.#events = options.events
    this.#maxConcurrent = Math.min(4, Math.max(1, options.maxConcurrent ?? 2))
  }

  async initialize(): Promise<void> { await this.#temp.initialize() }

  start(request: StartExportRequest, ownerWebContentsId: number): ApiResult<{ jobId: string }> {
    const authorization = this.#authorizeSnapshot(request.documentId, request.resourceScopeId, ownerWebContentsId)
    if (authorization) return authorization
    let targetPath: string
    try { targetPath = this.#selections.consume(request.targetSelectionToken, 'export-target', ownerWebContentsId).path }
    catch { return failure('SEC_SELECTION_TOKEN_INVALID', 'security', 'error.selectionTokenInvalid', false) }

    const job = this.#createJob(request.format, request, targetPath, request.options, ownerWebContentsId)
    this.#enqueue(job)
    return ok({ jobId: job.jobId })
  }

  print(request: PrintRequest, ownerWebContentsId: number): ApiResult<{ jobId: string }> {
    const authorization = this.#authorizeSnapshot(request.documentId, request.resourceScopeId, ownerWebContentsId)
    if (authorization) return authorization
    const job = this.#createJob('print', request, undefined, request.options, ownerWebContentsId)
    this.#enqueue(job)
    return ok({ jobId: job.jobId })
  }

  getStatus(jobId: string, ownerWebContentsId: number): ApiResult<ExportJobDTO> {
    const job = this.#jobs.get(jobId)
    if (!job || job.ownerWebContentsId !== ownerWebContentsId || !this.#capabilities.owns(jobId, 'export-job', ownerWebContentsId)) {
      return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false, { kind: 'export-job' })
    }
    return ok(this.#dto(job))
  }

  cancel(jobId: string, ownerWebContentsId: number): void {
    const job = this.#jobs.get(jobId)
    if (!job || job.ownerWebContentsId !== ownerWebContentsId || !this.#capabilities.owns(jobId, 'export-job', ownerWebContentsId)) return
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || job.committing) return
    job.controller.abort()
    this.#printSurface.cancel(jobId)
    if (job.status === 'queued') this.#completeCancelled(job)
  }

  cancelAllForWebContents(ownerWebContentsId: number): void {
    for (const job of this.#jobs.values()) if (job.ownerWebContentsId === ownerWebContentsId) this.cancel(job.jobId, ownerWebContentsId)
  }

  shutdown(): void {
    for (const job of this.#jobs.values()) if (!['completed', 'failed', 'cancelled'].includes(job.status)) job.controller.abort()
    this.#worker.closeAll()
    this.#printSurface.closeAll()
  }

  #authorizeSnapshot(documentId: string, resourceScopeId: string | undefined, ownerWebContentsId: number): ApiResult<{ jobId: string }> | null {
    if (this.#capabilities.has(documentId, 'document') && !this.#capabilities.owns(documentId, 'document', ownerWebContentsId)) {
      return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false, { kind: 'document' })
    }
    if (resourceScopeId && (!this.#capabilities.owns(resourceScopeId, 'resource', ownerWebContentsId) || !this.#assets.ownsDocumentScope(documentId, resourceScopeId, ownerWebContentsId))) {
      return failure('SEC_CAPABILITY_NOT_OWNED', 'security', 'error.capabilityNotOwned', false, { kind: 'resource' })
    }
    return null
  }

  #createJob(
    kind: JobKind,
    request: ExportSnapshotRequestBase,
    targetPath: string | undefined,
    options: RuntimeJob['options'],
    ownerWebContentsId: number
  ): RuntimeJob {
    const jobId = randomUUID()
    const snapshot = createExportSnapshot({
      jobId,
      documentId: request.documentId,
      revision: request.revision,
      markdown: request.markdown,
      format: kind === 'print' ? 'pdf' : kind,
      title: request.title,
      textFormat: request.textFormat,
      capabilityProfile: defaultCapabilityProfile(),
      ...(request.resourceScopeId ? { resourceScopeId: request.resourceScopeId } : {})
    })
    const job: RuntimeJob = {
      jobId,
      ownerWebContentsId,
      kind,
      snapshot,
      targetPath,
      options,
      correlationId: randomUUID(),
      controller: new AbortController(),
      startedAt: new Date().toISOString(),
      status: 'queued',
      progress: undefined,
      completedAt: undefined,
      errorCode: undefined,
      diagnosticCodes: [],
      committing: false
    }
    this.#jobs.set(jobId, job)
    this.#capabilities.register(jobId, 'export-job', ownerWebContentsId)
    return job
  }

  #enqueue(job: RuntimeJob): void {
    this.#queue.push(job.jobId)
    this.#emitProgress(job, { phase: 'preparing', percent: 0, messageKey: 'export.queued' })
    this.#pump()
  }

  #pump(): void {
    while (this.#active < this.#maxConcurrent && this.#queue.length) {
      const jobId = this.#queue.shift()!
      const job = this.#jobs.get(jobId)
      if (!job || job.status !== 'queued') continue
      if (job.controller.signal.aborted) { this.#completeCancelled(job); continue }
      this.#active += 1
      void this.#run(job).finally(() => { this.#active -= 1; this.#pump() })
    }
  }

  async #run(job: RuntimeJob): Promise<void> {
    let tempPrepared = false
    try {
      await this.#temp.prepare(job.jobId)
      tempPrepared = true
      this.#setStatus(job, 'preparing', { phase: 'preparing', percent: 8, messageKey: 'export.preparing' })
      this.#throwIfAborted(job)
      const document = buildExportDocument(job.snapshot)

      this.#setStatus(job, 'resolving-assets', { phase: 'assets', percent: 22, messageKey: 'export.resolvingAssets' })
      const resolved = await this.#assets.resolve(document, job.snapshot, job.ownerWebContentsId, job.controller.signal)
      job.diagnosticCodes.push(...resolved.diagnostics.map((diagnostic) => diagnostic.code))
      this.#throwIfAborted(job)

      this.#setStatus(job, 'rendering', { phase: 'rendering', percent: 45, messageKey: 'export.rendering' })
      if (job.kind === 'html') await this.#runHtml(job, document, resolved.assets)
      else if (job.kind === 'docx') await this.#runDocx(job, document, resolved.assets)
      else await this.#runPrintFamily(job, document, resolved.assets)

      this.#throwIfAborted(job)
      job.status = 'completed'
      job.completedAt = new Date().toISOString()
      this.#emitProgress(job, { phase: 'finishing', percent: 100, messageKey: 'export.completed' })
      this.#events.completed(job.ownerWebContentsId, this.#completedEvent(job, true, false))
      this.#scheduleRetention(job)
    } catch (error) {
      if (isAbortError(error) || job.controller.signal.aborted) this.#completeCancelled(job)
      else {
        job.status = 'failed'
        job.completedAt = new Date().toISOString()
        job.errorCode = this.#errorCode(error)
        this.#events.completed(job.ownerWebContentsId, this.#completedEvent(job, false, false))
        this.#scheduleRetention(job)
      }
    } finally {
      this.#printSurface.cancel(job.jobId)
      if (tempPrepared) await this.#temp.cleanup(job.jobId).catch(() => undefined)
    }
  }

  async #runHtml(job: RuntimeJob, document: ReturnType<typeof buildExportDocument>, assets: Awaited<ReturnType<ExportAssetResolver['resolve']>>['assets']): Promise<void> {
    const response = await this.#worker.run({ type: 'render-html', document, assets, options: toHtmlOptions(job.options as IpcHtmlOptions) }, job.controller.signal)
    this.#mergeDiagnostics(job, response.diagnostics)
    if (!response.html || !/^<!doctype html>/iu.test(response.html.trimStart())) throw new Error('EXPORT_HTML_VERIFICATION_FAILED')
    this.#setStatus(job, 'writing', { phase: 'writing', percent: 82, messageKey: 'export.writing' })
    await this.#temp.writeJobFile(job.jobId, 'result.tmp', response.html)
    this.#throwIfAborted(job)
    if (!job.targetPath) throw new Error('EXPORT_TARGET_MISSING')
    job.committing = true
    await this.#temp.commitFinal(job.targetPath, new TextEncoder().encode(response.html))
  }

  async #runDocx(job: RuntimeJob, document: ReturnType<typeof buildExportDocument>, assets: Awaited<ReturnType<ExportAssetResolver['resolve']>>['assets']): Promise<void> {
    const response = await this.#worker.run({ type: 'render-docx', document, assets, options: toDocxOptions(job.options as IpcDocxOptions) }, job.controller.signal)
    this.#mergeDiagnostics(job, response.diagnostics)
    if (!response.bytes || !verifyDocxBytes(response.bytes)) throw new Error('EXPORT_DOCX_VERIFICATION_FAILED')
    this.#setStatus(job, 'writing', { phase: 'writing', percent: 82, messageKey: 'export.writing' })
    await this.#temp.writeJobFile(job.jobId, 'result.tmp', response.bytes)
    this.#throwIfAborted(job)
    if (!job.targetPath) throw new Error('EXPORT_TARGET_MISSING')
    job.committing = true
    await this.#temp.commitFinal(job.targetPath, response.bytes)
  }

  async #runPrintFamily(job: RuntimeJob, document: ReturnType<typeof buildExportDocument>, assets: Awaited<ReturnType<ExportAssetResolver['resolve']>>['assets']): Promise<void> {
    const options = toPdfOptions(job.options as IpcPdfOptions)
    const response = await this.#worker.run({ type: 'render-print-html', document, assets, options }, job.controller.signal)
    this.#mergeDiagnostics(job, response.diagnostics)
    if (!response.html) throw new Error('EXPORT_PRINT_HTML_MISSING')
    this.#throwIfAborted(job)
    if (job.kind === 'print') {
      this.#setStatus(job, 'rendering', { phase: 'packaging', percent: 72, messageKey: 'export.printing' })
      await this.#printSurface.print(job.jobId, response.html, options, job.controller.signal)
      return
    }
    this.#setStatus(job, 'rendering', { phase: 'packaging', percent: 72, messageKey: 'export.buildingPdf' })
    const bytes = await this.#printSurface.renderPdf(job.jobId, response.html, options, job.controller.signal)
    this.#setStatus(job, 'writing', { phase: 'writing', percent: 88, messageKey: 'export.writing' })
    await this.#temp.writeJobFile(job.jobId, 'result.tmp', bytes)
    this.#throwIfAborted(job)
    if (!job.targetPath) throw new Error('EXPORT_TARGET_MISSING')
    job.committing = true
    await this.#temp.commitFinal(job.targetPath, bytes)
  }

  #throwIfAborted(job: RuntimeJob): void { if (job.controller.signal.aborted) throw new DOMException('Export cancelled.', 'AbortError') }

  #setStatus(job: RuntimeJob, status: RuntimeJob['status'], progress: ExportProgress): void {
    job.status = status
    this.#emitProgress(job, progress)
  }

  #emitProgress(job: RuntimeJob, progress: ExportProgress): void {
    job.progress = Object.freeze({ ...progress })
    this.#events.progress(job.ownerWebContentsId, {
      jobId: job.jobId,
      documentId: job.snapshot.documentId,
      sourceRevision: job.snapshot.revision,
      format: job.kind,
      status: job.status,
      progress: job.progress
    })
  }

  #mergeDiagnostics(job: RuntimeJob, diagnostics: readonly ExportResultDiagnostic[]): void {
    for (const diagnostic of diagnostics) if (!job.diagnosticCodes.includes(diagnostic.code)) job.diagnosticCodes.push(diagnostic.code)
  }

  #completeCancelled(job: RuntimeJob): void {
    if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') return
    job.status = 'cancelled'
    job.completedAt = new Date().toISOString()
    job.errorCode = 'EXPORT_CANCELLED'
    this.#events.completed(job.ownerWebContentsId, this.#completedEvent(job, false, true))
    this.#scheduleRetention(job)
  }

  #scheduleRetention(job: RuntimeJob): void {
    const timer = setTimeout(() => {
      const current = this.#jobs.get(job.jobId)
      if (current !== job || !['completed', 'failed', 'cancelled'].includes(job.status)) return
      this.#jobs.delete(job.jobId)
      this.#capabilities.revoke(job.jobId)
    }, 10 * 60 * 1000)
    timer.unref?.()
  }

  #completedEvent(job: RuntimeJob, success: boolean, cancelled: boolean): ExportCompletedEvent {
    return {
      jobId: job.jobId,
      documentId: job.snapshot.documentId,
      sourceRevision: job.snapshot.revision,
      format: job.kind,
      success,
      cancelled,
      correlationId: job.correlationId,
      ...(job.targetPath ? { displayPath: job.targetPath } : {}),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(job.diagnosticCodes.length ? { diagnosticCodes: Object.freeze([...job.diagnosticCodes]) } : {})
    }
  }

  #dto(job: RuntimeJob): ExportJobDTO {
    return {
      jobId: job.jobId,
      documentId: job.snapshot.documentId,
      sourceRevision: job.snapshot.revision,
      status: job.status,
      format: job.kind,
      startedAt: job.startedAt,
      ...(job.completedAt ? { completedAt: job.completedAt } : {}),
      ...(job.targetPath ? { targetDisplayPath: job.targetPath } : {}),
      ...(job.progress ? { progress: job.progress } : {}),
      correlationId: job.correlationId,
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(job.diagnosticCodes.length ? { diagnosticCodes: Object.freeze([...job.diagnosticCodes]) } : {})
    }
  }

  #errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : ''
    const explicit = /\b(EXPORT_[A-Z0-9_]+)\b/u.exec(message)?.[1]
    return explicit ?? 'EXPORT_FAILED'
  }
}
