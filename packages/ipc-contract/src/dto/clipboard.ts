export interface ClipboardImageDTO {
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
}

export interface RichClipboardRequest {
  readonly text: string
  readonly html: string
}
