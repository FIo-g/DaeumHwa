import { renderContextPack } from '@/ai/context'
import { buildContinuationPrompt } from '@/ai/tasks/draft-chapter'
import { pack } from './shared'

// The continuation prompt for the same input as the draft-chapter sample, with a short first part.
export const draftContinueSample = buildContinuationPrompt(
  {
    instructions: 'Mina finds the letter under the stairs.',
    targetChars: 3000,
    styleCards: [
      {
        name: 'Mina Park speech',
        entryName: 'Mina Park',
        tone: 'blunt',
        rules: 'Short sentences.',
        examples: 'Fine. Move.',
      },
      { name: 'Narration', entryName: null, tone: '', rules: '', examples: '' },
    ],
    packText: renderContextPack(pack),
    previousSummary: null,
    previousTail: 'The door closed.',
    chapterLabel: 'Chapter 4',
  },
  'Mina opened the door.',
)
