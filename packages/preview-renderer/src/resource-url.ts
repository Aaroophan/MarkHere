export type PreviewResourceDecision =
  | { readonly kind: 'local'; readonly url: string }
  | { readonly kind: 'remote'; readonly url: string }
  | { readonly kind: 'blocked'; readonly reason: string }

const explicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/
const windowsAbsolutePath = /^[A-Za-z]:[\\/]/

export function classifyPreviewImage(
  rawTarget: string,
  resourceScopeId: string,
  allowRemoteHttpsImages: boolean
): PreviewResourceDecision {
  const target = rawTarget.trim()
  if (!resourceScopeId) return { kind: 'blocked', reason: 'resource-scope-unavailable' }
  if (!target) return { kind: 'blocked', reason: 'empty-resource' }
  if (target.startsWith('//')) return { kind: 'blocked', reason: 'protocol-relative-resource' }
  if (windowsAbsolutePath.test(target) || target.startsWith('/') || target.startsWith('\\')) {
    return { kind: 'blocked', reason: 'absolute-local-resource' }
  }

  if (explicitScheme.test(target)) {
    let parsed: URL
    try { parsed = new URL(target) } catch { return { kind: 'blocked', reason: 'malformed-resource-url' } }
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'https:' && allowRemoteHttpsImages) {
      if (!parsed.hostname || parsed.username || parsed.password) {
        return { kind: 'blocked', reason: 'unsafe-https-resource' }
      }
      return { kind: 'remote', url: parsed.href }
    }
    return { kind: 'blocked', reason: protocol === 'http:' ? 'insecure-http-resource' : 'resource-scheme-not-allowed' }
  }

  const pathOnly = target.split(/[?#]/u, 1)[0] ?? ''
  let decoded = pathOnly
  try { decoded = decodeURIComponent(pathOnly) } catch { return { kind: 'blocked', reason: 'invalid-resource-encoding' } }
  decoded = decoded.replaceAll('\\', '/')
  if (!decoded || decoded.includes('\0')) return { kind: 'blocked', reason: 'invalid-local-resource' }
  return {
    kind: 'local',
    url: `markhere-resource://${resourceScopeId}/r/${encodeURIComponent(decoded)}`
  }
}
