import { renderContextPack } from '@/ai/context'
import { draftBeatsTask } from '@/ai/tasks/draft-beats'
import type { DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { pack } from './shared'

// English input for the beat-list prompt: the prose draft prompt without the length lines.
export const draftBeatsInput: DraftPromptInput = {
  instructions: 'Mina climbs the clock tower stairs. The caretaker hands her the brass key.',
  targetChars: 3000,
  styleCards: [
    {
      name: 'Mina Park speech',
      entryName: 'Mina Park',
      tone: 'blunt',
      rules: 'Short sentences.',
      examples: 'Fine. Move.',
    },
  ],
  packText: renderContextPack(pack),
  previousSummary: null,
  previousTail: 'The door closed.',
  chapterLabel: 'Chapter 4 (new chapter)',
}

export const draftBeatsSample = draftBeatsTask.buildPrompt(draftBeatsInput)
