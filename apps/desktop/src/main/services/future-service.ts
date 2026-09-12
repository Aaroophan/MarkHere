import type { ApiResult } from '@markhere/ipc-contract'
import { featureUnavailable } from './api-results'

/**
 * Issue 2 defines and secures the bridge surface. Domain authority is added by
 * Issues 3-9. Until then these operations fail closed rather than using a
 * temporary generic filesystem/update/export API.
 */
export class FutureService {
  unavailable<T>(feature: string): ApiResult<T> {
    return featureUnavailable(feature) as ApiResult<T>
  }
}
