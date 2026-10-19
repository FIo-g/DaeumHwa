import type { DraftRepairOutput } from '@/ai/tasks/draft-repair'

// Stand-in output for the draft-repair task. Used only by tests (see src/test/fake-ai.ts).
// No edits: the draft is kept as it is.
export function fakeDraftRepair(): DraftRepairOutput {
  return { edits: [] }
}
