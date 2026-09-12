import type { MarkHereDesktopApi } from '@markhere/ipc-contract'

declare global {
  interface Window {
    readonly markhere: MarkHereDesktopApi
  }
}

export {}
