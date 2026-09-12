import { extname, isAbsolute, relative, resolve } from 'node:path'
import { MARKHERE_IDENTITY } from '@markhere/shared'

const APPLICATION_HOST = 'app'

const ALLOWED_ASSET_MIME_TYPES = Object.freeze<Record<string, string>>({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8'
})

export interface AppProtocolResolution {
  readonly ok: boolean
  readonly status: number
  readonly filePath?: string
  readonly mimeType?: string
  readonly reason?: string
}

function rawPathFromRequestUrl(requestUrl: string): string {
  const schemeSeparator = requestUrl.indexOf('://')
  if (schemeSeparator < 0) return '/'

  const authorityAndRest = requestUrl.slice(schemeSeparator + 3)
  const slash = authorityAndRest.indexOf('/')
  const query = authorityAndRest.indexOf('?')
  const hash = authorityAndRest.indexOf('#')
  const firstSuffix = [query, hash].filter((index) => index >= 0).sort((a, b) => a - b)[0]

  // A slash that occurs only inside the query or fragment is not a path slash.
  if (slash < 0 || (firstSuffix !== undefined && firstSuffix < slash)) return '/'

  const pathAndSuffix = authorityAndRest.slice(slash)
  return pathAndSuffix.split(/[?#]/, 1)[0] ?? '/'
}

export function resolveAppProtocolRequest(
  requestUrl: string,
  rendererRoot: string
): AppProtocolResolution {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return { ok: false, status: 400, reason: 'invalid-url' }
  }

  if (parsed.protocol !== `${MARKHERE_IDENTITY.appProtocol}:` || parsed.host !== APPLICATION_HOST) {
    return { ok: false, status: 403, reason: 'invalid-app-origin' }
  }

  // WHATWG URL parsing normalizes literal and percent-encoded dot segments.
  // Inspect the raw path first so an input such as /%2e%2e/secret.js is
  // rejected rather than normalized to /secret.js before our containment
  // policy sees it. The raw path is decoded exactly once; the filesystem
  // mapping never performs a second percent-decoding pass.
  const rawPath = rawPathFromRequestUrl(requestUrl)

  let decodedRawPath: string
  try {
    decodedRawPath = decodeURIComponent(rawPath)
  } catch {
    return { ok: false, status: 400, reason: 'invalid-percent-encoding' }
  }

  if (decodedRawPath.includes('\\') || decodedRawPath.includes('\0')) {
    return { ok: false, status: 400, reason: 'invalid-path-character' }
  }

  const rawSegments = decodedRawPath.split('/').filter((segment) => segment.length > 0)
  if (rawSegments.some((segment) => segment === '.' || segment === '..')) {
    return { ok: false, status: 403, reason: 'path-traversal' }
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(parsed.pathname)
  } catch {
    return { ok: false, status: 400, reason: 'invalid-percent-encoding' }
  }

  if (decodedPath.includes('\\') || decodedPath.includes('\0')) {
    return { ok: false, status: 400, reason: 'invalid-path-character' }
  }

  const pathSegments = decodedPath.split('/').filter((segment) => segment.length > 0)
  if (pathSegments.some((segment) => segment === '.' || segment === '..')) {
    return { ok: false, status: 403, reason: 'path-traversal' }
  }

  const relativePath = pathSegments.length === 0 ? 'index.html' : pathSegments.join('/')
  const target = resolve(rendererRoot, relativePath)
  const containment = relative(rendererRoot, target)
  if (!containment || containment === '.') {
    return { ok: false, status: 403, reason: 'directory-request' }
  }
  if (containment.startsWith('..') || isAbsolute(containment)) {
    return { ok: false, status: 403, reason: 'scope-escape' }
  }

  const extension = extname(target).toLowerCase()
  const mimeType = ALLOWED_ASSET_MIME_TYPES[extension]
  if (!mimeType) {
    return { ok: false, status: 415, reason: 'asset-type-not-allowed' }
  }

  return { ok: true, status: 200, filePath: target, mimeType }
}
