import { renderContextPack } from '@/ai/context'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { pack } from './shared'

export const draftSample = buildDraftPrompt({
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
  chapterLabel: '4화 (새 회차)',
})
