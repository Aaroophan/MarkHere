import { shell } from 'electron'
import { SecurityPolicy } from '@markhere/security-core'
import type { ApiResult } from '@markhere/ipc-contract'
import { failure, ok } from './api-results'

export class ShellService {
  readonly #policy: SecurityPolicy
  constructor(policy = new SecurityPolicy()) { this.#policy = policy }
  async openExternal(rawUrl: string): Promise<ApiResult<void>> {
    const decision = this.#policy.mayOpenExternalUrl(rawUrl)
    if (decision.decision !== 'allow') {
      return failure('SEC_URL_BLOCKED', 'security', 'error.externalUrlBlocked', true, {
        reason: decision.reason
      })
    }
    await shell.openExternal(decision.normalizedUrl)
    return ok(undefined)
  }
}
