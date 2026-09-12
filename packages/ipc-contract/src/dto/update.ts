export interface UpdateStatus {
  readonly state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  readonly version?: string
  readonly percent?: number
  readonly errorCode?: string
}
