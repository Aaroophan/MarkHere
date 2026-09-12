import { app } from 'electron'
import { join } from 'node:path'

export interface ApplicationStoragePaths {
  readonly appData: string
  readonly sessions: string
  readonly recovery: string
  readonly diagnostics: string
}

export function getApplicationStoragePaths(): ApplicationStoragePaths {
  const root = app.getPath('userData')
  return {
    appData: join(root, 'app'),
    sessions: join(root, 'sessions'),
    recovery: join(root, 'sessions', 'recovery'),
    diagnostics: join(root, 'diagnostics')
  }
}
