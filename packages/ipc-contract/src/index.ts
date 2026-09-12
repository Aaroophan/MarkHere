import type { MARKHERE_BRIDGE_VERSION } from '@markhere/shared'

export interface AppRuntimeInfo {
  readonly productName: 'MarkHere'
  readonly bridgeVersion: typeof MARKHERE_BRIDGE_VERSION
  readonly platform: string
  readonly arch: string
  readonly electronVersion: string
  readonly chromeVersion: string
  readonly nodeVersion: string
}

export interface MarkHereBridge {
  readonly app: {
    getRuntimeInfo(): AppRuntimeInfo
  }
}
