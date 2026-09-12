import { app, net, protocol } from 'electron'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MARKHERE_IDENTITY } from '@markhere/shared'
import { resolveAppProtocolRequest } from './app-protocol-path'

const APPLICATION_HOST = 'app'
const APP_ORIGIN = `${MARKHERE_IDENTITY.appProtocol}://${APPLICATION_HOST}`

export { resolveAppProtocolRequest } from './app-protocol-path'

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MARKHERE_IDENTITY.appProtocol,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
        allowServiceWorkers: false,
        stream: true,
        codeCache: true
      }
    },
    {
      scheme: MARKHERE_IDENTITY.resourceProtocol,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
        allowServiceWorkers: false,
        stream: true,
        codeCache: false
      }
    }
  ])
}

export function getPackagedRendererRoot(): string {
  return resolve(app.getAppPath(), 'out', 'renderer')
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

export function installAppProtocolHandlers(rendererRoot = getPackagedRendererRoot()): void {
  protocol.handle(MARKHERE_IDENTITY.appProtocol, async (request) => {
    const resolution = resolveAppProtocolRequest(request.url, rendererRoot)
    if (!resolution.ok || !resolution.filePath || !resolution.mimeType) {
      return errorResponse(resolution.status, 'Blocked MarkHere application resource request.')
    }

    try {
      // Re-check containment on canonical filesystem paths so a packaged
      // symlink cannot turn a syntactically in-root request into an escape.
      const [canonicalRoot, canonicalTarget] = await Promise.all([
        realpath(rendererRoot),
        realpath(resolution.filePath)
      ])
      const canonicalRelative = relative(canonicalRoot, canonicalTarget)
      if (canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative)) {
        return errorResponse(403, 'Blocked MarkHere application resource request.')
      }

      const info = await stat(canonicalTarget)
      if (!info.isFile()) return errorResponse(404, 'Not found.')

      const response = await net.fetch(pathToFileURL(canonicalTarget).href)
      const headers = new Headers(response.headers)
      headers.set('content-type', resolution.mimeType)
      headers.set('x-content-type-options', 'nosniff')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch {
      return errorResponse(404, 'Not found.')
    }
  })

  // Issue 4 installs the capability-backed resource broker. Until then the
  // secure scheme is registered but fails closed instead of exposing file://.
  protocol.handle(MARKHERE_IDENTITY.resourceProtocol, () =>
    errorResponse(404, 'Resource capabilities are not available before Issue 4.')
  )
}

export function getApplicationOrigin(): string {
  return APP_ORIGIN
}

export function getApplicationEntryUrl(surface: 'editor' | 'settings' = 'editor'): string {
  const query = surface === 'settings' ? '?surface=settings' : ''
  return `${APP_ORIGIN}/index.html${query}`
}
