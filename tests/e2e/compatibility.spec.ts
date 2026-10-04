import { test, expect } from '@playwright/test'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchMarkHere } from './electron-harness'

test('COMP-PRESERVE-001 NFR-COMP-003 no-edit mode switching does not rewrite disk bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'markhere-preserve-'))
  const target = join(dir, 'සිංහල தமிழ் 中文 📝.md')
  await copyFile(resolve('packages/test-fixtures/fixtures/roundtrip/unknown-preservation.md'), target)
  const before = await readFile(target)
  const app = await launchMarkHere([target])
  try {
    for (const mode of ['Source', 'Preview', 'Split']) await app.page.getByRole('button', { name: mode }).click()
  } finally { await app.close() }
  expect(await readFile(target)).toEqual(before)
  await rm(dir, { recursive: true, force: true })
})
