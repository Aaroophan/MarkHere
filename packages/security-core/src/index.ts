export type ExternalUrlDecision =
  | { readonly decision: 'allow'; readonly normalizedUrl: string; readonly protocol: 'https:' | 'mailto:' }
  | { readonly decision: 'deny'; readonly reason: string }

export type RemoteImageDecision =
  | { readonly decision: 'allow'; readonly normalizedUrl: string }
  | { readonly decision: 'deny'; readonly reason: string }

export type UrlIntent =
  | 'external-navigation'
  | 'remote-image'
  | 'local-document-link'
  | 'local-resource'
  | 'application-route'

export interface SecurityRequestBudgets {
  readonly maxExternalUrlLength: number
  readonly maxResourceUrlLength: number
  readonly maxIpcStringBytes: number
  readonly maxMarkdownBytes: number
  readonly largeMarkdownBytes: number
  readonly maxImageTransferBytes: number
  readonly maxClipboardTextBytes: number
  readonly maxClipboardHtmlBytes: number
  readonly maxSearchQueryLength: number
  readonly maxSearchGlobs: number
  readonly maxSearchResults: number
  readonly maxConcurrentExportsPerWindow: number
  readonly maxInvalidIpcPerWindowPerMinute: number
}

export const SECURITY_BUDGETS: SecurityRequestBudgets = Object.freeze({
  maxExternalUrlLength: 8 * 1024,
  maxResourceUrlLength: 16 * 1024,
  maxIpcStringBytes: 32 * 1024 * 1024,
  maxMarkdownBytes: 32 * 1024 * 1024,
  largeMarkdownBytes: 5 * 1024 * 1024,
  maxImageTransferBytes: 8 * 1024 * 1024,
  maxClipboardTextBytes: 8 * 1024 * 1024,
  maxClipboardHtmlBytes: 16 * 1024 * 1024,
  maxSearchQueryLength: 4 * 1024,
  maxSearchGlobs: 32,
  maxSearchResults: 5_000,
  maxConcurrentExportsPerWindow: 2,
  maxInvalidIpcPerWindowPerMinute: 120
})

export const SAFE_EXTERNAL_PROTOCOLS = Object.freeze(['https:', 'mailto:'] as const)
export const MAX_EXTERNAL_URL_LENGTH = SECURITY_BUDGETS.maxExternalUrlLength

const forbiddenControlCharacters = /[\0-\x1F\x7F]/
const malformedPercentEncoding = /%(?![0-9A-Fa-f]{2})/
const encodedControlCharacter = /%(?:0[0-9A-F]|1[0-9A-F]|7F)/i

function validateUrlShape(rawUrl: string, maxLength: number): { ok: true; parsed: URL } | { ok: false; reason: string } {
  if (rawUrl.length === 0) return { ok: false, reason: 'empty-url' }
  if (rawUrl.length > maxLength) return { ok: false, reason: 'url-too-long' }
  if (rawUrl.trim() !== rawUrl) return { ok: false, reason: 'surrounding-whitespace' }
  if (forbiddenControlCharacters.test(rawUrl) || encodedControlCharacter.test(rawUrl)) return { ok: false, reason: 'control-character' }
  if (malformedPercentEncoding.test(rawUrl)) return { ok: false, reason: 'invalid-percent-encoding' }
  try { return { ok: true, parsed: new URL(rawUrl) } } catch { return { ok: false, reason: 'malformed-url' } }
}

export function classifyExternalUrl(rawUrl: string): ExternalUrlDecision {
  const shape = validateUrlShape(rawUrl, SECURITY_BUDGETS.maxExternalUrlLength)
  if (!shape.ok) return { decision: 'deny', reason: shape.reason }
  const parsed = shape.parsed
  const protocol = parsed.protocol.toLowerCase()
  if (!SAFE_EXTERNAL_PROTOCOLS.includes(protocol as (typeof SAFE_EXTERNAL_PROTOCOLS)[number])) return { decision: 'deny', reason: 'scheme-not-allowed' }
  if (protocol === 'https:') {
    if (!parsed.hostname) return { decision: 'deny', reason: 'https-host-required' }
    if (parsed.username || parsed.password) return { decision: 'deny', reason: 'embedded-credentials' }
  }
  return { decision: 'allow', normalizedUrl: parsed.href, protocol: protocol as 'https:' | 'mailto:' }
}

export function classifyRemoteImageUrl(rawUrl: string, policy: 'block' | 'ask' | 'allow-https'): RemoteImageDecision {
  if (policy !== 'allow-https') return { decision: 'deny', reason: policy === 'ask' ? 'user-approval-required' : 'remote-images-blocked' }
  const shape = validateUrlShape(rawUrl, SECURITY_BUDGETS.maxExternalUrlLength)
  if (!shape.ok) return { decision: 'deny', reason: shape.reason }
  const parsed = shape.parsed
  if (parsed.protocol !== 'https:') return { decision: 'deny', reason: 'remote-image-requires-https' }
  if (!parsed.hostname || parsed.username || parsed.password) return { decision: 'deny', reason: 'remote-image-host-invalid' }
  return { decision: 'allow', normalizedUrl: parsed.href }
}

export interface CapabilityPolicyInput {
  readonly owned: boolean
  readonly permission?: 'read' | 'write'
  readonly requested: 'read' | 'write'
}

/**
 * Product-wide pure policy authority. Main-process adapters provide OS/capability
 * facts, while this class decides whether the requested security action is allowed.
 */
export class SecurityPolicy {
  readonly budgets = SECURITY_BUDGETS

  mayOpenExternalUrl(rawUrl: string): ExternalUrlDecision { return classifyExternalUrl(rawUrl) }
  mayLoadRemoteImage(rawUrl: string, policy: 'block' | 'ask' | 'allow-https'): RemoteImageDecision { return classifyRemoteImageUrl(rawUrl, policy) }

  mayNavigate(targetUrl: string, expectedOrigin: string): boolean {
    try {
      const target = new URL(targetUrl)
      const expected = new URL(expectedOrigin)
      return target.protocol === expected.protocol && target.host === expected.host
    } catch { return false }
  }

  mayCreateWindow(): false { return false }
  mayResolveLocalResource(ownedScope: boolean): boolean { return ownedScope }
  mayReadCapability(input: CapabilityPolicyInput): boolean { return input.owned && (input.permission === 'read' || input.permission === 'write') }
  mayWriteCapability(input: CapabilityPolicyInput): boolean { return input.owned && input.permission === 'write' && input.requested === 'write' }

  redactUrl(rawUrl: string): string {
    const shape = validateUrlShape(rawUrl, SECURITY_BUDGETS.maxExternalUrlLength)
    if (!shape.ok) return '<invalid-url>'
    const parsed = shape.parsed
    return parsed.protocol === 'mailto:' ? 'mailto:<redacted>' : `${parsed.protocol}//${parsed.host}/<redacted>`
  }
}

export function classifyExternalProtocol(protocol: string): 'allow' | 'deny' {
  return SAFE_EXTERNAL_PROTOCOLS.includes(protocol.toLowerCase() as (typeof SAFE_EXTERNAL_PROTOCOLS)[number]) ? 'allow' : 'deny'
}
