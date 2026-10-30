import { renderContextPack } from '@/ai/context'
import { draftPlanTask, type DraftPlanInput } from '@/ai/tasks/draft-plan'
import { pack } from './shared'

// English input for the plan prompt: the draft prompt without length lines, plus the scene count.
export const draftPlanInput: DraftPlanInput = {
  instructions: '',
  targetChars: 3750,
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
  sceneCount: 3,
  advice: null,
  revision: null,
}

export const draftPlanSample = draftPlanTask.buildPrompt(draftPlanInput)
