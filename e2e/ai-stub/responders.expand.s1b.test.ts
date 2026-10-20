import { describe, expect, it } from 'vitest'
import { buildExpandPrompt, DRAFT_EXPAND_SYSTEM, expansionRejection } from '@/ai/tasks/draft-expand'
import { respond } from './responders'

const SCENE = '서윤은 조용히 문을 열었다. 바람이 차가웠다.'

describe('draft-expand stub answer', () => {
  it('answers with the scene text and new sentences that pass acceptExpansion', () => {
    const reply = respond({
      system: [{ type: 'text', text: DRAFT_EXPAND_SYSTEM }],
      messages: [
        {
          role: 'user',
          content: buildExpandPrompt({
            before: '',
            scene: SCENE,
            after: '',
            targetChars: 1500,
            styleCards: [],
            instructions: '서윤이 문을 연다.',
          }),
        },
      ],
      model: 'stub',
    })

    expect(reply.task).toBe('draft-expand')
    expect(reply.text.startsWith(SCENE)).toBe(true)
    expect(expansionRejection(SCENE, reply.text)).toBeNull()
  })
})
