import { randomUUID } from 'node:crypto'
import type { ApiResult, ErrorCategory, ErrorDTO } from '@markhere/ipc-contract'

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

export function failure(
  code: string,
  category: ErrorCategory,
  messageKey: string,
  recoverable: boolean,
  details?: Readonly<Record<string, string | number | boolean | null>>
): ApiResult<never> {
  const error: ErrorDTO = {
    code,
    category,
    messageKey,
    recoverable,
    correlationId: randomUUID(),
    ...(details ? { details } : {})
  }
  return { ok: false, error }
}

export function featureUnavailable(feature: string): ApiResult<never> {
  return failure('FEATURE_NOT_AVAILABLE', 'internal', 'error.featureNotAvailable', true, { feature })
}
