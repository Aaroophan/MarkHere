import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  outputDir: 'test-results/playwright-artifacts'
})
