import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/performance',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/performance-playwright.json' }]],
  outputDir: 'test-results/performance-artifacts'
})
