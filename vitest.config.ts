import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['tests/support/vitest-global-setup.ts'],
    exclude: [...defaultExclude, 'tests/e2e/**']
  }
})
