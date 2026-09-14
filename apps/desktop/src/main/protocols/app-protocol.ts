import { app, net, protocol, session } from 'electron'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MARKHERE_IDENTITY } from '@markhere/shared'
import type { ResourceCapabilityBroker } from '../resources/resource-capability-broker'
import { resolveAppProtocolRequest } from './app-protocol-path'

const APPLICATION_HOST = 'app'
const APP_ORIGIN = `${MARKHERE_IDENTITY.appProtocol}://${APPLICATION_HOST}`
const SVG_ACTIVE_XML = /<!\s*(?:DOCTYPE|ENTITY)\b/i

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
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
}

function resourceHeaders(mimeType: string, svg: boolean): Headers {
  const headers = new Headers({
    'content-type': mimeType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })
  if (svg) {
    // SVG is active-capable XML. Even after the renderer sanitizes SVG used by
    // Mermaid, local SVG image files are served in a constrained image context
    // with no script, network, form, frame, or base authority.
    headers.set(
      'content-security-policy',
      "sandbox; default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'"
    )
  }
  return headers
}

export function installAppProtocolHandlers(
  rendererRoot = getPackagedRendererRoot(),
  resources?: ResourceCapabilityBroker
): void {
  // Electron's ProtocolRequest intentionally does not expose the requesting
  // WebContents. Enforce capability ownership one layer earlier through the
  // default session's webRequest metadata, which supplies webContentsId and
  // resourceType. This is the only onBeforeRequest listener in MarkHere;
  // Electron uses only the last listener registered for a given webRequest
  // event, so future request policy must be composed into this gate rather
  // than registering another listener elsewhere.
  const developmentOrigin = (() => {
    try { return process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : null }
    catch { return null }
  })()
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: [`${MARKHERE_IDENTITY.resourceProtocol}://*/*`, 'file://*/*', 'http://*/*', 'https://*/*'] },
    (details, callback) => {
      const ownerWebContentsId = details.webContentsId
      if (details.url.startsWith(`${MARKHERE_IDENTITY.resourceProtocol}://`)) {
        const allowed = details.resourceType === 'image' &&
          typeof ownerWebContentsId === 'number' && ownerWebContentsId > 0 &&
          !!resources?.ownsProtocolRequest(details.url, ownerWebContentsId)
        callback({ cancel: !allowed })
        return
      }

      // Local-first default: a Markdown/WYSIWYG renderer cannot turn an image,
      // CSS URL, raw HTML, plugin DOM node, or raw file path into an implicit
      // network/filesystem request. Local document assets must use the scoped
      // markhere-resource:// broker. The dev Vite origin is the sole network
      // exception required to load the renderer.
      if (typeof ownerWebContentsId === 'number' && ownerWebContentsId > 0) {
        if (details.url.startsWith('file:')) {
          callback({ cancel: true })
          return
        }
        try {
          const target = new URL(details.url)
          callback({ cancel: developmentOrigin === null || target.origin !== developmentOrigin })
        } catch { callback({ cancel: true }) }
        return
      }
      callback({ cancel: false })
    }
  )

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

  protocol.handle(MARKHERE_IDENTITY.resourceProtocol, async (request) => {
    if (!resources) return errorResponse(404, 'Resource capability is unavailable.')
    const resolution = await resources.resolveProtocolRequest(request.url)
    if (!resolution.ok) return errorResponse(resolution.status, 'Blocked MarkHere document resource request.')

    try {
      const bytes = await readFile(resolution.resource.canonicalPath)
      if (resolution.resource.svg) {
        const source = bytes.toString('utf8')
        if (SVG_ACTIVE_XML.test(source)) {
          return errorResponse(415, 'SVG document declarations and entities are not permitted.')
        }
      }
      return new Response(bytes, {
        status: 200,
        headers: resourceHeaders(resolution.resource.mimeType, resolution.resource.svg)
      })
    } catch {
      return errorResponse(404, 'Not found.')
    }
  })
}

export function getApplicationOrigin(): string {
  return APP_ORIGIN
}

export function getApplicationEntryUrl(surface: 'editor' | 'settings' = 'editor'): string {
  const query = surface === 'settings' ? '?surface=settings' : ''
  return `${APP_ORIGIN}/index.html${query}`
}
