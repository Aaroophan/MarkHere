import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { launchMarkHere } from '../e2e/electron-harness'

test('@soak SOAK-001 repeated mode switching/open session does not leak windows', async () => {
  const app=await launchMarkHere([resolve('packages/test-fixtures/fixtures/markdown-everything.md')])
  try {
    const start=await app.app.evaluate(({BrowserWindow}: any)=>({windows:BrowserWindow.getAllWindows().length}))
    for(let i=0;i<40;i++) for(const mode of ['Source','Split','Preview','WYSIWYG']) await app.page.getByRole('button',{name:mode}).click()
    const end=await app.app.evaluate(({BrowserWindow,webContents}: any)=>({windows:BrowserWindow.getAllWindows().length,webContents:webContents.getAllWebContents().length}))
    expect(end.windows).toBe(start.windows)
    expect(end.webContents).toBeLessThanOrEqual(4)
  } finally { await app.close() }
})
