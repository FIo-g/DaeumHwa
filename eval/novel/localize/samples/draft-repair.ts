import { draftRepairTask } from '@/ai/tasks/draft-repair'

// The repair prompt for one English sample-copy flag.
export const draftRepairSample = draftRepairTask.buildPrompt({
  text: 'Mina opened the door.',
  flags: [{ kind: 'sample-copy', start: 0, end: 21, quote: 'Mina opened the door.', reason: 'x' }],
})
