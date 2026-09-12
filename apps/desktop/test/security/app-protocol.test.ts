import { describe, expect, it } from 'vitest'
import { resolveAppProtocolRequest } from '../../src/main/protocols/app-protocol-path'

describe('markhere:// protocol path resolver', () => {
  const root = process.platform === 'win32' ? 'C:\\app\\out\\renderer' : '/app/out/renderer'

  it('maps app assets inside the fixed renderer root', () => {
    const result = resolveAppProtocolRequest('markhere://app/assets/index.js', root)
    expect(result.ok).toBe(true)
    expect(result.filePath).toContain('assets')
    expect(result.mimeType).toBe('text/javascript; charset=utf-8')
  })

  it('maps the application root to index.html', () => {
    const result = resolveAppProtocolRequest('markhere://app/', root)
    expect(result.ok).toBe(true)
    expect(result.filePath).toContain('index.html')
    expect(result.mimeType).toBe('text/html; charset=utf-8')
  })

  it('rejects wrong hosts and unsupported asset types', () => {
    expect(resolveAppProtocolRequest('markhere://evil/index.html', root).ok).toBe(false)
    expect(resolveAppProtocolRequest('markhere://app/secrets.txt', root).status).toBe(415)
  })

  it('rejects literal, encoded, slash-encoded, and backslash traversal attempts', () => {
    expect(resolveAppProtocolRequest('markhere://app/../../secret.js', root).ok).toBe(false)
    expect(resolveAppProtocolRequest('markhere://app/%2e%2e/%2e%2e/secret.js', root).ok).toBe(false)
    expect(resolveAppProtocolRequest('markhere://app/..%2fsecret.js', root).ok).toBe(false)
    expect(resolveAppProtocolRequest('markhere://app/%5c..%5csecret.js', root).ok).toBe(false)
  })

  it('rejects malformed percent encoding', () => {
    expect(resolveAppProtocolRequest('markhere://app/%zz/index.js', root).status).toBe(400)
  })

  it('does not mistake query or fragment slashes for an application path', () => {
    expect(resolveAppProtocolRequest('markhere://app?next=/assets/index.js', root).filePath).toContain('index.html')
    expect(resolveAppProtocolRequest('markhere://app#fragment/with/slashes', root).filePath).toContain('index.html')
  })
})
