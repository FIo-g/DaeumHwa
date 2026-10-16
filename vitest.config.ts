import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}', 'eval/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
