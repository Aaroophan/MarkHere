import type { Session } from 'electron'

/** Deny browser permission surfaces MarkHere does not need in the desktop shell. */
export function installSessionSecurity(session: Session): void {
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
}
