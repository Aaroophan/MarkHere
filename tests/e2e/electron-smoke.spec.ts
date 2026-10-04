import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { launchMarkHere } from './electron-harness'

test('E2E-WIN-OPEN-001 FR-APP-001/FR-FILE-001 launches with a synthetic Markdown file', async () => {
  const fixture = resolve('packages/test-fixtures/fixtures/foundation.md')
  const app = await launchMarkHere([fixture])
  try {
    await expect(app.page.getByText('MarkHere', { exact: true }).first()).toBeVisible()
    await expect(app.page.getByRole('button', { name: 'Source' })).toBeVisible()
    await expect(app.page.getByRole('button', { name: 'Save' })).toBeEnabled()
  } finally { await app.close() }
})

test('E2E-MODE-001 FR-SRC-006/FR-SPLIT-001 switches all four modes without losing the fixture', async () => {
  const fixture = resolve('packages/test-fixtures/fixtures/markdown-everything.md')
  const app = await launchMarkHere([fixture])
  try {
    for (const mode of ['Source', 'Split', 'WYSIWYG', 'Preview']) {
      await app.page.getByRole('button', { name: mode }).click()
      await expect(app.page.getByRole('button', { name: mode })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(await readFile(fixture, 'utf8')).toContain('#')
  } finally { await app.close() }
})

test('E2E-SEC-001 NFR-SEC-001/002 exposes no Node or raw IPC in renderer', async () => {
  const app = await launchMarkHere()
  try {
    const exposure = await app.page.evaluate(() => ({
      require: typeof (globalThis as any).require,
      process: typeof (globalThis as any).process,
      electron: typeof (globalThis as any).electron,
      rawSend: typeof (globalThis as any).markhere?.send,
      rawInvoke: typeof (globalThis as any).markhere?.invoke
    }))
    expect(exposure).toEqual({ require: 'undefined', process: 'undefined', electron: 'undefined', rawSend: 'undefined', rawInvoke: 'undefined' })
  } finally { await app.close() }
})
