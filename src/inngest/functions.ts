import { getDb } from '@/db/client'
import { advanceImportJob, BUSY_MESSAGE } from '@/server/imports'
import { inngest } from '@/inngest/client'

// Background import run. Each chapter is one step, so a failed step is retried on its own and
// the job's cursor (not Inngest) is the source of truth. The loop stops when the job is done or
// is no longer running (paused, cancelled or failed).
//
// Inngest caps the number of steps in one run, and a serial can have up to 2000 chapters. After
// MAX_STEPS_PER_RUN advances the run sends a new `import/run` event for the same job and ends.
// The new run picks up at the cursor, so no chapter is skipped or processed twice.

const IMPORT_EVENT = 'import/run'
// Leave room under the 1000-step cap for a sleep after every advance and the continuation event.
export const MAX_STEPS_PER_RUN = 499

export const importRun = inngest.createFunction(
  {
    id: 'import-run',
    triggers: [{ event: IMPORT_EVENT }],
    concurrency: { limit: 1, key: 'event.data.jobId' },
  },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string
    for (let i = 0; i < MAX_STEPS_PER_RUN; i++) {
      const result = await step.run(`advance-${i}`, () => advanceImportJob(getDb(), jobId))
      if (result.done || result.status !== 'running') return result
      if (result.message === BUSY_MESSAGE) await step.sleep(`busy-${i}`, '2s')
    }
    await step.sendEvent('continue-import', { name: IMPORT_EVENT, data: { jobId } })
    return { status: 'running' as const, done: false }
  },
)
