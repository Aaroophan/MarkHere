export interface AppInfo {
  readonly name: 'MarkHere'
  readonly version: string
  readonly channel: 'dev' | 'alpha' | 'beta' | 'stable'
  readonly electron: string
  readonly chromium: string
  readonly node: string
  readonly bridgeVersion: 1
}

export interface PlatformInfo {
  readonly platform: string
  readonly arch: string
}
