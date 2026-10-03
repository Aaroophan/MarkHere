export interface DiagnosticBundleDTO {
  readonly displayPath: string
  readonly createdAt: string
}

export interface SafeModeStatusDTO {
  readonly active: boolean
}

export interface RendererFaultReport {
  readonly kind: 'vue' | 'window-error' | 'unhandled-rejection'
  readonly component?: string
}
