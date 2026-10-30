import { describe, expect, it } from 'vitest'
import { REASON_LABELS } from '@/lib/draft-check'
import { sceneFixTask } from '@/ai/tasks/scene-fix'
import { draftPlanTask } from '@/ai/tasks/draft-plan'
import { findHangul, translateScaffold } from './scaffold'

function sceneFixPrompt(): string {
  const labels = Object.values(REASON_LABELS)
  const reasons = labels.map((label, i) => {
    if (i === 0) return { label, note: '3678/1375자' }
    if (i === 1) return { label, note: 'Han Serin 말투' }
    return { label, note: 'English note.' }
  })
  return sceneFixTask.buildPrompt({
    scene: 'Mina stood at the gate. She did not move.',
    before: 'Mina ran down the stairs.',
    after: 'Jun closed the gate.',
    reasons,
    planScene: 'Mina arrives at the gate.',
    requests: [],
    styleCards: [],
  })
}

function draftPlanPrompt(): string {
  return draftPlanTask.buildPrompt({
    instructions: 'Mina waits at the gate and finds the key.',
    targetChars: 3750,
    styleCards: [],
    packText: 'Pack.',
    previousSummary: null,
    previousTail: 'The door closed.',
    chapterLabel: 'Chapter 4 (new chapter)',
    sceneCount: 2,
    advice: null,
    revision: {
      card: {
        scenes: [
          {
            summary: 'Mina finds the letter.',
            goal: 'Learn who wrote it.',
            decision: '',
            stake: '',
            trigger: '',
            role: 'opening',
            place: 'Gate',
            characters: ['Mina'],
            targetChars: 1250,
          },
          {
            summary: 'Jun closes the gate.',
            goal: 'See what Mina hides.',
            decision: '',
            stake: '',
            trigger: '',
            role: 'ending',
            place: 'Gate',
            characters: ['Jun'],
            targetChars: 1250,
          },
        ],
        ending: { device: 'crisis', line: 'The door opens.' },
        threads: [],
      },
      note: 'Keep the key in the scene.',
      earlierNotes: ['Keep the key.'],
    },
  })
}

describe('stage3 review scaffold (F2)', () => {
  it('translates every scene-fix reason label, counts and speech notes', () => {
    expect(findHangul(translateScaffold(sceneFixPrompt()))).toEqual([])
  })

  it('translates the draft-plan revision line', () => {
    expect(findHangul(translateScaffold(draftPlanPrompt()))).toEqual([])
  })
})
