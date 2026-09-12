export type ExternalUrlDecision =
  | { readonly decision: 'allow'; readonly normalizedUrl: string; readonly protocol: 'https:' | 'mailto:' }
  | { readonly decision: 'deny'; readonly reason: string }

export type UrlIntent =
  | 'external-navigation'
  | 'remote-image'
  | 'local-document-link'
  | 'local-resource'
  | 'application-route'

export const SAFE_EXTERNAL_PROTOCOLS = Object.freeze(['https:', 'mailto:'] as const)
export const MAX_EXTERNAL_URL_LENGTH = 8 * 1024

const forbiddenControlCharacters = /[\0-\x1F\x7F]/
const malformedPercentEncoding = /%(?![0-9A-Fa-f]{2})/
const encodedControlCharacter = /%(?:0[0-9A-F]|1[0-9A-F]|7F)/i

/**
 * Central policy immediately before an untrusted/document-derived URL crosses
 * into Electron shell authority. Keep this pure so it is reusable/testable.
 */
export function classifyExternalUrl(rawUrl: string): ExternalUrlDecision {
  if (rawUrl.length === 0) return { decision: 'deny', reason: 'empty-url' }
  if (rawUrl.length > MAX_EXTERNAL_URL_LENGTH) return { decision: 'deny', reason: 'url-too-long' }
  if (rawUrl.trim() !== rawUrl) return { decision: 'deny', reason: 'surrounding-whitespace' }
  if (forbiddenControlCharacters.test(rawUrl) || encodedControlCharacter.test(rawUrl)) {
    return { decision: 'deny', reason: 'control-character' }
  }
  if (malformedPercentEncoding.test(rawUrl)) {
    return { decision: 'deny', reason: 'invalid-percent-encoding' }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { decision: 'deny', reason: 'malformed-url' }
  }

  const protocol = parsed.protocol.toLowerCase()
  if (!SAFE_EXTERNAL_PROTOCOLS.includes(protocol as (typeof SAFE_EXTERNAL_PROTOCOLS)[number])) {
    return { decision: 'deny', reason: 'scheme-not-allowed' }
  }

  if (protocol === 'https:') {
    if (parsed.hostname.length === 0) return { decision: 'deny', reason: 'https-host-required' }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return { decision: 'deny', reason: 'embedded-credentials' }
    }
  }

  return {
    decision: 'allow',
    normalizedUrl: parsed.href,
    protocol: protocol as 'https:' | 'mailto:'
  }
}

/**
 * Kept for compatibility with Issue-1 callers. New security-sensitive code
 * should call classifyExternalUrl() so it receives the normalized URL too.
 */
export function classifyExternalProtocol(protocol: string): 'allow' | 'deny' {
  return SAFE_EXTERNAL_PROTOCOLS.includes(protocol.toLowerCase() as (typeof SAFE_EXTERNAL_PROTOCOLS)[number])
    ? 'allow'
    : 'deny'
}
