import { shell } from 'electron'
import { classifyExternalUrl } from '@markhere/security-core'
import type { ApiResult } from '@markhere/ipc-contract'
import { failure, ok } from './api-results'

export class ShellService {
  async openExternal(rawUrl: string): Promise<ApiResult<void>> {
    const decision = classifyExternalUrl(rawUrl)
    if (decision.decision !== 'allow') {
      return failure('SEC_URL_BLOCKED', 'security', 'error.externalUrlBlocked', true, {
        reason: decision.reason
      })
    }
    await shell.openExternal(decision.normalizedUrl)
    return ok(undefined)
  }
}
