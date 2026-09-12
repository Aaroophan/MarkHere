import { describe, expect, it } from 'vitest'
import type { WebContents, WebFrameMain } from 'electron'
import { TrustedWebContentsRegistry } from '../../src/main/security/trusted-web-contents-registry'

function fakeWebContents(id: number): WebContents {
  return {
    id,
    isDestroyed: () => false,
    once: () => undefined
  } as unknown as WebContents
}

function fakeTopFrame(origin: string): WebFrameMain {
  const frame = {
    origin,
    isDestroyed: () => false,
    top: null,
    parent: null
  } as unknown as { origin: string; isDestroyed(): boolean; top: WebFrameMain | null; parent: WebFrameMain | null }
  frame.top = frame as unknown as WebFrameMain
  return frame as unknown as WebFrameMain
}

function fakeChildFrame(origin: string): WebFrameMain {
  const top = fakeTopFrame(origin)
  return {
    origin,
    isDestroyed: () => false,
    top,
    parent: top
  } as unknown as WebFrameMain
}

describe('TrustedWebContentsRegistry', () => {
  it('rejects an unregistered sender before privileged work', () => {
    const registry = new TrustedWebContentsRegistry()
    expect(() => registry.assertTrustedSender(fakeWebContents(41), fakeTopFrame('markhere://app'))).toThrow()
  })

  it('accepts only the registered top-level expected origin', () => {
    const registry = new TrustedWebContentsRegistry()
    const contents = fakeWebContents(42)
    registry.register(contents, 'editor', 'markhere://app')
    expect(registry.assertTrustedSender(contents, fakeTopFrame('markhere://app')).kind).toBe('editor')
    expect(() => registry.assertTrustedSender(contents, fakeTopFrame('https://example.com'))).toThrow()
    expect(() => registry.assertTrustedSender(contents, fakeChildFrame('markhere://app'))).toThrow()
  })
})
