import { describe, expect, it } from 'vitest'
import { buildScenePrompt, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { withSceneTargets } from '@/lib/draft-plan'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { findHangul, translateScaffold } from './scaffold'

// Stage 1 (scenes mode): the per-scene prompt carries no Korean scaffolding after translation.

const input: DraftPromptInput = {
  instructions: 'Mina finds the letter under the stairs.',
  targetChars: 5000,
  styleCards: [],
  packText: 'Mina Park: a clerk at the clock tower.',
  previousSummary: null,
  previousTail: null,
  chapterLabel: '1화',
  sceneCount: 3,
}

describe('scenes draft prompt English scaffold (stage 1)', () => {
  it('translates the scene prompt without Hangul, first and last scene', () => {
    const card = withSceneTargets(fakeDraftPlan(), 5000)
    expect(findHangul(translateScaffold(buildScenePrompt(input, card, 0, '')))).toEqual([])
    const last = translateScaffold(buildScenePrompt(input, card, 2, 'Mina reads it.'))
    expect(findHangul(last)).toEqual([])
    expect(last).toContain('Write only scene 3 and stop.')
    expect(last).toContain('This is the last scene.')
  })
})
