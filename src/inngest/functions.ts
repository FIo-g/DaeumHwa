import { getDb } from '@/db/client'
import { advanceImportJob } from '@/server/imports'
import { inngest } from '@/inngest/client'

// Background import run. Each chapter is one step, so a failed step is retried on its own and
// the job's cursor (not Inngest) is the source of truth. The loop stops when the job is done or
// is no longer running (paused, cancelled or failed).
//
// Inngest caps the number of steps in one run, and a serial can have up to 2000 chapters. After
// MAX_STEPS_PER_RUN steps the run sends a new `import/run` event for the same job and ends. The
// new run picks up at the cursor, so no chapter is skipped or processed twice.

const IMPORT_EVENT = 'import/run'
export const MAX_STEPS_PER_RUN = 500

export const importRun = inngest.createFunction(
  { id: 'import-run', triggers: [{ event: IMPORT_EVENT }] },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string
    for (let i = 0; i < MAX_STEPS_PER_RUN; i++) {
      const result = await step.run(`advance-${i}`, () => advanceImportJob(getDb(), jobId))
      if (result.done || result.status !== 'running') return result
    }
    await step.sendEvent('continue-import', { name: IMPORT_EVENT, data: { jobId } })
    return { status: 'running' as const, done: false }
  },
)
