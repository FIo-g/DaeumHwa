import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/ai/fake'
import { proofreadTask } from '@/ai/tasks/proofread'

const input = { text: '안 되요. 그건 좀 어색해요.' }

describe('proofreadTask', () => {
  it('system prompt is the Korean proofreading brief', () => {
    expect(proofreadTask.system.startsWith('당신은 한국어 웹소설 교정자다.')).toBe(true)
    expect(proofreadTask.system).toContain(
      '대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다.',
    )
  })

  it('fake output is an empty suggestion list and validates with the schema', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: proofreadTask.system,
      prompt: proofreadTask.buildPrompt(input),
      schema: proofreadTask.schema,
      effort: proofreadTask.effort,
      maxTokens: proofreadTask.maxTokens,
      fake: () => proofreadTask.fake(input),
    })
    expect(result.object).toEqual({ suggestions: [] })
  })

  it('postProcess drops quotes that cannot be located in the text', () => {
    const output = {
      suggestions: [
        { quote: '없는 문장', replacement: '고친 문장', kind: 'spelling' as const, reason: '이유' },
        { quote: '되요', replacement: '돼요', kind: 'spelling' as const, reason: '이유' },
      ],
    }
    const processed = proofreadTask.postProcess?.(output, input)
    expect(processed?.suggestions.map((s) => s.quote)).toEqual(['되요'])
  })

  it('postProcess drops suggestions whose replacement equals the quote', () => {
    const output = {
      suggestions: [
        { quote: '어색해요', replacement: '어색해요', kind: 'awkward' as const, reason: '이유' },
        { quote: '어색해요', replacement: '어색합니다', kind: 'awkward' as const, reason: '이유' },
      ],
    }
    const processed = proofreadTask.postProcess?.(output, input)
    expect(processed?.suggestions).toEqual([
      { quote: '어색해요', replacement: '어색합니다', kind: 'awkward', reason: '이유' },
    ])
  })
})
