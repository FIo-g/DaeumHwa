import { describe, expect, it } from 'vitest'
import { ENTITY_NAME_RULES } from '@/ai/extraction-rules'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'

// G2: the shared name rules tell the model to write a known card's full name.
describe('interview extraction: full card names (G2)', () => {
  it('the shared entity name rules ask for the full name of a known card', () => {
    expect(ENTITY_NAME_RULES).toContain('전체 이름을 그대로 쓴다')
    expect(interviewExtractTask.system).toContain('전체 이름을 그대로 쓴다')
  })
})
