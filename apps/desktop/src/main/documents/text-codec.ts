import chardet from 'chardet'
import iconv from 'iconv-lite'
import type { TextFormatMetadata } from '@markhere/ipc-contract'

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff])

export interface DecodedText {
  readonly markdown: string
  readonly textFormat: TextFormatMetadata
}

function detectLineEnding(text: string): 'lf' | 'crlf' | 'cr' {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\r' && text[i] !== '\n') continue
    if (text[i] === '\r' && text[i + 1] === '\n') {
      crlf += 1
      i += 1
    } else if (text[i] === '\r') cr += 1
    else lf += 1
  }
  if (crlf >= lf && crlf >= cr && crlf > 0) return 'crlf'
  if (cr > lf && cr > 0) return 'cr'
  return 'lf'
}

function hasFinalNewline(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(text)
}

function strictUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function decodeUtf16Be(bytes: Buffer): string {
  const swapped = Buffer.allocUnsafe(bytes.length)
  for (let i = 0; i < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1] ?? 0
    swapped[i + 1] = bytes[i] ?? 0
  }
  return swapped.toString('utf16le')
}

export function decodeDocumentBytes(bytes: Buffer): DecodedText {
  if (bytes.length === 0) return { markdown: '', textFormat: { encoding: 'utf8', lineEnding: 'lf', hasFinalNewline: false, bom: false } }

  let markdown: string
  let encoding: string
  let detectedEncodingName: string | undefined
  let bom = false

  if (bytes.subarray(0, 3).equals(UTF8_BOM)) {
    markdown = bytes.subarray(3).toString('utf8')
    encoding = 'utf8-bom'
    bom = true
  } else if (bytes.subarray(0, 2).equals(UTF16_LE_BOM)) {
    markdown = bytes.subarray(2).toString('utf16le')
    encoding = 'utf16le'
    bom = true
  } else if (bytes.subarray(0, 2).equals(UTF16_BE_BOM)) {
    markdown = decodeUtf16Be(bytes.subarray(2))
    encoding = 'utf16be'
    bom = true
  } else {
    const utf8 = strictUtf8(bytes)
    if (utf8 !== null) {
      markdown = utf8
      encoding = 'utf8'
    } else {
      const detected = chardet.detect(bytes) ?? 'windows-1252'
      detectedEncodingName = detected
      if (!iconv.encodingExists(detected)) throw new Error(`Detected encoding '${detected}' is not supported for decoding.`)
      markdown = iconv.decode(bytes, detected)
      encoding = 'other-detected'
    }
  }

  return {
    markdown,
    textFormat: {
      encoding,
      ...(detectedEncodingName ? { detectedEncodingName } : {}),
      lineEnding: detectLineEnding(markdown),
      hasFinalNewline: hasFinalNewline(markdown),
      bom
    }
  }
}

function normalizeLineEndings(markdown: string, lineEnding: TextFormatMetadata['lineEnding']): string {
  const normalized = markdown.replace(/\r\n|\r|\n/g, '\n')
  if (lineEnding === 'crlf') return normalized.replace(/\n/g, '\r\n')
  if (lineEnding === 'cr') return normalized.replace(/\n/g, '\r')
  return normalized
}

export function encodeDocumentText(markdown: string, format: TextFormatMetadata): Buffer {
  let text = normalizeLineEndings(markdown, format.lineEnding)
  const newline = format.lineEnding === 'crlf' ? '\r\n' : format.lineEnding === 'cr' ? '\r' : '\n'
  text = text.replace(/(?:\r\n|\r|\n)+$/, '')
  if (format.hasFinalNewline) text += newline

  if (format.encoding === 'utf16le') return Buffer.concat([format.bom ? UTF16_LE_BOM : Buffer.alloc(0), Buffer.from(text, 'utf16le')])
  if (format.encoding === 'utf16be') {
    const le = Buffer.from(text, 'utf16le')
    const be = Buffer.allocUnsafe(le.length)
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1] ?? 0
      be[i + 1] = le[i] ?? 0
    }
    return Buffer.concat([format.bom ? UTF16_BE_BOM : Buffer.alloc(0), be])
  }
  if (format.encoding === 'other-detected') {
    const name = format.detectedEncodingName
    if (!name || !iconv.encodingExists(name)) throw new Error('Legacy encoding cannot be preserved safely; Save As UTF-8 is required.')
    return iconv.encode(text, name)
  }
  const utf8 = Buffer.from(text, 'utf8')
  return format.encoding === 'utf8-bom' || format.bom ? Buffer.concat([UTF8_BOM, utf8]) : utf8
}
