import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { pack } from './shared'

export const continuityCheckSample = continuityCheckTask.buildPrompt({
  chapterText: 'Mina opened the drawer at midnight.',
  chapterPosition: 3,
  chapterTitle: 'Midnight',
  pack,
})
