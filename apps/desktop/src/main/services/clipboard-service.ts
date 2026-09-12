import { clipboard } from 'electron'
import type { ApiResult, ClipboardImageDTO, RichClipboardRequest } from '@markhere/ipc-contract'
import { failure, ok } from './api-results'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 8 * 1024 * 1024

export class ClipboardService {
  readImageForImport(): ApiResult<ClipboardImageDTO | null> {
    const image = clipboard.readImage()
    if (image.isEmpty()) return ok(null)
    const bytes = image.toPNG()
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return failure('CLIPBOARD_IMAGE_TOO_LARGE', 'validation', 'error.clipboardImageTooLarge', true, {
        maxBytes: MAX_IMAGE_BYTES
      })
    }
    const size = image.getSize()
    return ok({
      mimeType: 'image/png',
      bytes: new Uint8Array(bytes),
      width: size.width,
      height: size.height
    })
  }

  writeText(text: string): ApiResult<void> {
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
      return failure('CLIPBOARD_TEXT_TOO_LARGE', 'validation', 'error.clipboardTextTooLarge', true)
    }
    clipboard.writeText(text)
    return ok(undefined)
  }

  writeRich(request: RichClipboardRequest): ApiResult<void> {
    if (Buffer.byteLength(request.text, 'utf8') + Buffer.byteLength(request.html, 'utf8') > 16 * 1024 * 1024) {
      return failure('CLIPBOARD_RICH_TOO_LARGE', 'validation', 'error.clipboardRichTooLarge', true)
    }
    clipboard.write({ text: request.text, html: request.html })
    return ok(undefined)
  }
}

