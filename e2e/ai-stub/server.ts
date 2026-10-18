// Entry point for the E2E AI stub (`pnpm e2e:ai-stub`). Playwright waits for GET /health on this port.

import { createStubServer } from './stub'

const PORT = Number(process.env.E2E_AI_STUB_PORT ?? 3199)
const HOST = '127.0.0.1'

createStubServer().listen(PORT, HOST, () => {
  console.log(`E2E AI stub listening on http://${HOST}:${PORT}`)
})
