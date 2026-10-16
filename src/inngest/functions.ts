import { getDb } from '@/db/client'
import { advanceImportJob } from '@/server/imports'
import { inngest } from '@/inngest/client'

// Background import run. Each chapter is one step, so a failed step is retried on its own and
// the job's cursor (not Inngest) is the source of truth. The loop stops when the job is done or
// is no longer running (paused, cancelled or failed).

const MAX_STEPS = 2000

export const importRun = inngest.createFunction(
  { id: 'import-run', triggers: [{ event: 'import/run' }] },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string
    for (let i = 0; i < MAX_STEPS; i++) {
      const result = await step.run(`advance-${i}`, () => advanceImportJob(getDb(), jobId))
      if (result.done || result.status !== 'running') return result
    }
    return { status: 'running' as const, done: false }
  },
)
