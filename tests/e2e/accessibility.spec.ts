import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { resolve } from 'node:path'
import { launchMarkHere } from './electron-harness'

test('@a11y A11Y-001 NFR-A11Y-001..005 editor shell has no serious/critical automated violations', async () => {
  const app = await launchMarkHere([resolve('packages/test-fixtures/fixtures/unicode/multiscript.md')])
  try {
    const results = await new AxeBuilder({ page: app.page }).analyze()
    const blockers = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(blockers, blockers.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  } finally { await app.close() }
})

test('@a11y A11Y-KEYBOARD-001 primary editor controls are keyboard reachable', async () => {
  const app = await launchMarkHere([resolve('packages/test-fixtures/fixtures/foundation.md')])
  try {
    await app.page.keyboard.press('Tab')
    let reached = false
    for (let i = 0; i < 30; i += 1) {
      const name = await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ?? (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '')
      if (/Save|Settings|Preview|Source|WYSIWYG|Split/.test(name)) { reached = true; break }
      await app.page.keyboard.press('Tab')
    }
    expect(reached).toBe(true)
  } finally { await app.close() }
})
