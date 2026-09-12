import { describe, expect, it } from 'vitest'
import { CHANNELS } from './internal-channels'
import { INVOKE_ARG_SCHEMAS, SaveDocumentRequestSchema } from './schemas'

describe('IPC runtime schemas', () => {
  it('rejects malformed save requests before service code receives them', () => {
    expect(() => SaveDocumentRequestSchema.parse({ documentId: '../secret', revision: 0 })).toThrow()
  })

  it('bounds external URL input', () => {
    const schema = INVOKE_ARG_SCHEMAS[CHANNELS.shellOpenExternal]
    expect(schema.safeParse(['https://example.com']).success).toBe(true)
    expect(schema.safeParse([`https://example.com/${'x'.repeat(9000)}`]).success).toBe(false)
  })
})
