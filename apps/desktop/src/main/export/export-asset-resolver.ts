import { readFile } from 'node:fs/promises'
import type { ExportAsset, ExportDocument, ExportResultDiagnostic, ExportSnapshot } from '@markhere/export-core'
import { collectImageSources, makeAssetId } from '@markhere/export-core'
import type { ResourceCapabilityBroker } from '../resources/resource-capability-broker'

export interface ExportAssetResolution {
  readonly assets: readonly ExportAsset[]
  readonly diagnostics: readonly ExportResultDiagnostic[]
}

const MAX_DATA_IMAGE_BYTES = 16 * 1024 * 1024
const MAX_EXPORT_ASSETS = 256
const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024
const DATA_IMAGE = /^data:(image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon));base64,([A-Za-z0-9+/=\s]+)$/iu

function dimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mimeType === 'image/png' && bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mimeType === 'image/gif' && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  if (mimeType === 'image/bmp' && bytes.length >= 26) return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) }
  if (mimeType === 'image/webp' && bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const type = String.fromCharCode(...bytes.subarray(12, 16))
    if (type === 'VP8X') {
      const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16)
      const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16)
      return { width, height }
    }
  }
  if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1] ?? 0
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
      const length = view.getUint16(offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) break
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      offset += 2 + length
    }
  }
  return null
}

function dataAsset(source: string): ExportAsset | null {
  const match = DATA_IMAGE.exec(source)
  if (!match?.[1] || !match[2]) return null
  try {
    const buffer = Buffer.from(match[2].replace(/\s+/gu, ''), 'base64')
    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_DATA_IMAGE_BYTES) return null
    const mimeType = match[1].toLocaleLowerCase('en-US') === 'image/jpg' ? 'image/jpeg' : match[1].toLocaleLowerCase('en-US')
    const bytes = new Uint8Array(buffer)
    const size = dimensions(bytes, mimeType)
    return Object.freeze({ id: makeAssetId(source), source, mimeType, bytes, ...(size ? size : {}) })
  } catch { return null }
}

export class ExportAssetResolver {
  readonly #resources: ResourceCapabilityBroker

  constructor(resources: ResourceCapabilityBroker) { this.#resources = resources }

  ownsDocumentScope(documentId: string, scopeId: string, ownerWebContentsId: number): boolean {
    return this.#resources.scopeForDocument(documentId, ownerWebContentsId) === scopeId
  }

  async resolve(document: ExportDocument, snapshot: ExportSnapshot, ownerWebContentsId: number, signal: AbortSignal): Promise<ExportAssetResolution> {
    const assets: ExportAsset[] = []
    const diagnostics: ExportResultDiagnostic[] = []
    const sources = collectImageSources(document)
    if (sources.length > MAX_EXPORT_ASSETS) diagnostics.push({ code: 'EXPORT_ASSET_COUNT_LIMIT', severity: 'warning', message: `Only the first ${MAX_EXPORT_ASSETS} unique images are eligible for embedding in one export job.` })
    let totalBytes = 0
    for (const source of sources.slice(0, MAX_EXPORT_ASSETS)) {
      if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError')
      if (/^data:/iu.test(source)) {
        const embedded = dataAsset(source)
        if (embedded && totalBytes + embedded.bytes.byteLength <= MAX_TOTAL_ASSET_BYTES) { assets.push(embedded); totalBytes += embedded.bytes.byteLength }
        else if (embedded) diagnostics.push({ code: 'EXPORT_ASSET_TOTAL_LIMIT', severity: 'warning', message: 'Export image embedding stopped at the per-job 64 MiB asset budget.' })
        else diagnostics.push({ code: 'EXPORT_DATA_IMAGE_REJECTED', severity: 'warning', message: 'An embedded image data URI was invalid, unsupported, or too large.' })
        continue
      }
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(source) || source.startsWith('//')) {
        diagnostics.push({ code: 'EXPORT_REMOTE_IMAGE_NOT_EMBEDDED', severity: 'info', message: `Remote image was not fetched during export: ${source}` })
        continue
      }
      if (!snapshot.resourceScopeId) {
        diagnostics.push({ code: 'EXPORT_RESOURCE_SCOPE_UNAVAILABLE', severity: 'warning', message: `Local image cannot be resolved for an unbound document: ${source}` })
        continue
      }
      const resolved = await this.#resources.resolveExportResource(snapshot.resourceScopeId, source, ownerWebContentsId)
      if (!resolved.ok) {
        diagnostics.push({ code: 'EXPORT_IMAGE_RESOLUTION_FAILED', severity: 'warning', message: `Local image could not be resolved (${resolved.reason}): ${source}` })
        continue
      }
      if (resolved.resource.svg) {
        diagnostics.push({ code: 'EXPORT_SVG_IMAGE_FALLBACK', severity: 'warning', message: `SVG image is not embedded by the Issue-7 exporter until SVG active-content sanitization is centralized: ${source}` })
        continue
      }
      if (totalBytes + resolved.resource.size > MAX_TOTAL_ASSET_BYTES) {
        diagnostics.push({ code: 'EXPORT_ASSET_TOTAL_LIMIT', severity: 'warning', message: `Image was not embedded because the export asset budget was reached: ${source}` })
        continue
      }
      const file = await readFile(resolved.resource.canonicalPath)
      if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError')
      const bytes = new Uint8Array(file)
      const size = dimensions(bytes, resolved.resource.mimeType)
      assets.push(Object.freeze({
        id: makeAssetId(source),
        source,
        mimeType: resolved.resource.mimeType,
        bytes,
        ...(size ? size : {})
      }))
      totalBytes += bytes.byteLength
    }
    return Object.freeze({ assets: Object.freeze(assets), diagnostics: Object.freeze(diagnostics) })
  }
}
