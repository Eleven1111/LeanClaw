import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: 'tests/support/playwright-global-setup.ts',
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: 'list'
})
