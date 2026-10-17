import * as Comlink from 'comlink'
import { createTextApi } from '@/workers/text-api'

// Entry point of the dedicated text worker, loaded by `src/lib/client/worker-client.ts`.
// It only runs inside the worker, so it exposes the API unconditionally. Do not guard this
// with `typeof window`: Next.js replaces that expression with "object" in client bundles,
// so such a guard is always false and the worker never answers.
Comlink.expose(createTextApi())
