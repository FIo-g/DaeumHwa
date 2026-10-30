import { describe, expect, it } from 'vitest'
import { buildDraftPrompt, buildScenePrompt, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { withSceneTargets } from '@/lib/draft-plan'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'

const input: DraftPromptInput = {
  instructions: 'Mina finds the letter.',
  targetChars: 5000,
  styleCards: [],
  packText: '(없음)',
  previousSummary: null,
  previousTail: null,
  chapterLabel: '1화',
  sceneCount: 3,
}
const card = withSceneTargets(fakeDraftPlan(), 5000)

describe('buildScenePrompt', () => {
  it('is the draft prompt, then the empty draft so far and the scene line for the first scene', () => {
    const prompt = buildScenePrompt(input, card, 0, '')
    expect(prompt.startsWith(buildDraftPrompt(input))).toBe(true)
    expect(
      prompt.endsWith(
        '\n\n<draft_so_far>\n(없음)\n</draft_so_far>\n<scene_now>장면 1만 쓰고 멈춘다. 이 장면은 공백 포함 약 1667자. 지금까지 0자를 썼고 회차 목표까지 5000자 남았다.</scene_now>',
      ),
    ).toBe(true)
  })

  it('gives the text so far and the remaining length for a later scene', () => {
    const prompt = buildScenePrompt(input, card, 1, '가')
    expect(prompt).toContain('<draft_so_far>\n가\n</draft_so_far>')
    expect(prompt).toContain('장면 2만 쓰고 멈춘다.')
    expect(prompt).toContain('지금까지 1자를 썼고 회차 목표까지 4999자 남았다.')
    expect(prompt).not.toContain('이 장면이 마지막 장면이다.')
  })

  it('marks the last scene', () => {
    const prompt = buildScenePrompt(input, card, 2, '가\n\n***\n\n나')
    expect(prompt).toContain('장면 3만 쓰고 멈춘다.')
    expect(prompt).toContain(' 이 장면이 마지막 장면이다.')
  })
})
