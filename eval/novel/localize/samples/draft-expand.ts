import { buildExpandPrompt } from '@/ai/tasks/draft-expand'

// The expansion prompt for one English span with a previous span before it.
export const draftExpandSample = buildExpandPrompt({
  before: 'The door closed.',
  scene: 'Mina stood at the gate. She counted the bells.',
  after: 'Jun opened the gate.',
  targetChars: 2000,
  styleCards: [
    {
      name: 'Mina Park speech',
      entryName: 'Mina Park',
      tone: 'blunt',
      rules: 'Short sentences.',
      examples: 'Fine. Move.',
    },
  ],
})
