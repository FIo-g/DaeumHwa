import { draftCheckTask, numberScenes, type DraftCheckInput } from '@/ai/tasks/draft-check'
import { sceneSpans } from '@/lib/scene'

// The check prompt for one English draft: numbered scenes, instructions, a plan, two checkable
// requests and one hidden fact, so every optional block is exercised.
const text = [
  'Mina opened the gate.',
  '***',
  'She counted the bells.',
  '***',
  'Jun closed the gate.',
].join('\n')

export const draftCheckInput: DraftCheckInput = {
  numbered: numberScenes(text, sceneSpans(text, 3)),
  sceneCount: 3,
  plan: 'Author note: (none)\nScene 1 (opening, about 1,000 characters including spaces)\n- What happens: Mina opens the gate.',
  instructions: 'Mina waits at the gate and finds the key.',
  requests: [
    {
      id: 'style-1',
      scope: 'work',
      kind: 'style',
      text: 'Write in short sentences.',
      pattern: null,
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
    {
      id: 'content-1',
      scope: 'work',
      kind: 'content',
      text: 'The key appears in the chapter.',
      pattern: null,
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
  ],
  hiddenFacts: ['The key belongs to Jun.'],
}

export const draftCheckSample = draftCheckTask.buildPrompt(draftCheckInput)
