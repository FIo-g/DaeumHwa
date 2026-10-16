import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm e2e:server',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 240000,
  },
  use: {
    baseURL: 'http://localhost:3100',
  },
})
