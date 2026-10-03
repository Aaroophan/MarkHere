const USER_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  FS_PERMISSION_DENIED: 'MarkHere does not have permission to access this file. Choose another location or update its permissions.',
  FS_DISK_FULL: 'The drive is out of free space. Free space or save the document somewhere else.',
  FS_NOT_FOUND: 'The file could not be found. It may have been moved or deleted.',
  FS_OPERATION_FAILED: 'The file operation failed. Retry, or choose another location.',
  DOC_TOO_LARGE: 'This document is larger than MarkHere can safely open in this build.',
  DOC_EXTERNAL_CONFLICT: 'The file changed outside MarkHere. Review the conflict before overwriting disk content.',
  SEC_URL_BLOCKED: 'MarkHere blocked this link because its URL or protocol is not permitted.',
  SEC_CAPABILITY_NOT_OWNED: 'MarkHere blocked an operation that was outside this window’s authorized scope.',
  SEC_SELECTION_TOKEN_INVALID: 'The selected file or folder authorization has expired. Choose it again.',
  IPC_INVALID_ARGUMENTS: 'MarkHere rejected an invalid application request.',
  IPC_REQUEST_TOO_LARGE: 'MarkHere rejected a request that exceeded the safe size limit.',
  IPC_RATE_LIMITED: 'Too many invalid requests were blocked. Try the operation again shortly.',
  EXPORT_TOO_MANY_JOBS: 'Too many exports are already running. Wait for one to finish or cancel it.',
  EXPORT_FAILED: 'The export could not be completed. Your Markdown document was not modified.',
  EXPORT_CANCELLED: 'The export was cancelled and incomplete output was removed.',
  WORKSPACE_SEARCH_FAILED: 'Workspace search could not complete. Adjust the search and try again.',
  DIAGNOSTIC_BUNDLE_FAILED: 'MarkHere could not create the diagnostic bundle. Your documents were not included or changed.',
  INTERNAL_ERROR: 'MarkHere encountered an internal error. Your document content was not intentionally changed.'
})

export function userMessageForErrorCode(code: string): string {
  return USER_ERROR_MESSAGES[code] ?? `The operation could not be completed. (${code})`
}
