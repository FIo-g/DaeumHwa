import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // ai-stub unit tests run under Vitest, not Playwright.
  testIgnore: '**/ai-stub/**',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm e2e:ai-stub',
      url: 'http://127.0.0.1:3199/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm e2e:server',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 240000,
    },
  ],
  use: {
    baseURL: 'http://localhost:3100',
  },
})
