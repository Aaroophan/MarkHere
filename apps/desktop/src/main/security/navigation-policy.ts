/**
 * Compare application origins by protocol + host rather than URL.origin.
 * Node's WHATWG URL implementation reports `null` for application-defined
 * schemes because it cannot observe Electron's `standard` scheme registry,
 * while Chromium correctly treats `markhere://app` as a standard secure
 * origin after registerSchemesAsPrivileged().
 */
export function isAllowedApplicationNavigation(targetUrl: string, expectedOrigin: string): boolean {
  try {
    const target = new URL(targetUrl)
    const expected = new URL(expectedOrigin)
    return target.protocol === expected.protocol && target.host === expected.host
  } catch {
    return false
  }
}
