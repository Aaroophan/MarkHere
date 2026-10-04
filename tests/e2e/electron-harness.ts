import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface MarkHereE2E { app: ElectronApplication; page: Page; userData: string; close(): Promise<void> }

export async function launchMarkHere(extraArgs: string[] = []): Promise<MarkHereE2E> {
  const userData = await mkdtemp(join(tmpdir(), 'markhere-e2e-'))
  const appRoot = resolve('apps/desktop')
  const app = await electron.launch({
    args: [appRoot, ...extraArgs],
    env: { ...process.env, MARKHERE_TEST_USER_DATA: userData, NODE_ENV: 'test' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return {
    app, page, userData,
    close: async () => { await app.close().catch(() => undefined); await rm(userData, { recursive: true, force: true }) }
  }
}
