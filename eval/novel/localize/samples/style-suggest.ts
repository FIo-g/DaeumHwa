import { styleSuggestTask } from '@/ai/tasks/style-suggest'

export const styleSuggestSample = styleSuggestTask.buildPrompt({
  entryName: 'Mina Park',
  samples: ['Fine. Move.', 'I am not waiting all night.'],
})
