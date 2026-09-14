import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CapabilityOwnershipRegistry } from '../../src/main/security/capability-ownership-registry'
import { ResourceCapabilityBroker } from '../../src/main/resources/resource-capability-broker'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixture(): Promise<{ root: string; broker: ResourceCapabilityBroker; scopeId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'markhere-resource-'))
  roots.push(root)
  await mkdir(join(root, 'images'))
  await writeFile(join(root, 'images', 'ok.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await writeFile(join(root, 'unsafe.svg'), '<svg><script>alert(1)</script></svg>')
  const broker = new ResourceCapabilityBroker(new CapabilityOwnershipRegistry())
  const scopeId = broker.bindDocument('document-1', 77, root)
  return { root, broker, scopeId }
}

describe('ResourceCapabilityBroker', () => {
  it('resolves an allowed in-scope image', async () => {
    const { broker, scopeId } = await fixture()
    const result = await broker.resolveProtocolRequest(`markhere-resource://${scopeId}/r/${encodeURIComponent('images/ok.png')}`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resource.mimeType).toBe('image/png')
  })

  it('requires the resource scope to belong to the requesting WebContents', async () => {
    const { broker, scopeId } = await fixture()
    const url = `markhere-resource://${scopeId}/r/${encodeURIComponent('images/ok.png')}`
    expect(broker.ownsProtocolRequest(url, 77)).toBe(true)
    expect(broker.ownsProtocolRequest(url, 78)).toBe(false)
    expect(broker.ownsProtocolRequest(url, 0)).toBe(false)
  })

  it('blocks traversal before filesystem access', async () => {
    const { broker, scopeId } = await fixture()
    const result = await broker.resolveProtocolRequest(`markhere-resource://${scopeId}/r/${encodeURIComponent('../secret.png')}`)
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('fails closed after a document scope is revoked', async () => {
    const { broker, scopeId } = await fixture()
    broker.revokeDocument('document-1')
    const result = await broker.resolveProtocolRequest(`markhere-resource://${scopeId}/r/${encodeURIComponent('images/ok.png')}`)
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})
