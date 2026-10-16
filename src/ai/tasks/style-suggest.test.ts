import { describe, expect, it } from 'vitest'
import {
  STYLE_SUGGEST_SYSTEM,
  StyleSuggestSchema,
  styleSuggestTask,
} from '@/ai/tasks/style-suggest'

const input = {
  entryName: '서윤',
  samples: ['"그건 아니야."', '"다시 말해 봐."', '"알겠어요."'],
}

describe('styleSuggestTask', () => {
  it('uses the medium effort and 4000 max tokens', () => {
    expect(styleSuggestTask.name).toBe('style-suggest')
    expect(styleSuggestTask.effort).toBe('medium')
    expect(styleSuggestTask.maxTokens).toBe(4000)
  })

  it('uses the exact Korean system prompt', () => {
    expect(styleSuggestTask.system).toBe(STYLE_SUGGEST_SYSTEM)
    expect(STYLE_SUGGEST_SYSTEM.split('\n')).toEqual([
      '당신은 웹소설 인물의 말투를 분석해 문체 카드를 만든다.',
      '규칙:',
      '- <samples>의 대사만 근거로 분석한다. 지어내지 않는다.',
      '- name은 "인물 이름 말투" 형식으로 쓴다.',
      '- tone에는 전체적인 말투 인상을 한 문장으로 쓴다.',
      '- rules에는 말투 규칙을 한 줄에 하나씩 쓴다(어미, 존댓말과 반말, 자주 쓰는 표현, 문장 길이, 쓰지 않는 표현).',
      '- examples에는 샘플 대사 중 그 인물다운 것 3~5줄을 그대로 옮긴다.',
      '- 모든 출력은 한국어로 쓴다.',
    ])
  })

  it('puts every sample line into the prompt', () => {
    const prompt = styleSuggestTask.buildPrompt(input)
    expect(prompt).toContain('서윤')
    for (const line of input.samples) expect(prompt).toContain(line)
  })

  it('fake output satisfies the schema and names the entry', () => {
    const output = StyleSuggestSchema.parse(styleSuggestTask.fake(input))
    expect(output.name).toBe('서윤 말투')
    expect(output.tone).not.toBe('')
    expect(output.rules).not.toBe('')
    expect(output.examples).toContain('"그건 아니야."')
  })
})
