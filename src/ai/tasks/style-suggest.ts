import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'

// Style card suggestion (spec F13): analyses one character's dialogue lines into a style card.

export const STYLE_SUGGEST_SYSTEM = `당신은 웹소설 인물의 말투를 분석해 문체 카드를 만든다.
규칙:
- <samples>의 대사만 근거로 분석한다. 지어내지 않는다.
- name은 "인물 이름 말투" 형식으로 쓴다.
- tone에는 전체적인 말투 인상을 한 문장으로 쓴다.
- rules에는 말투 규칙을 한 줄에 하나씩 쓴다(어미, 존댓말과 반말, 자주 쓰는 표현, 문장 길이, 쓰지 않는 표현).
- examples에는 샘플 대사 중 그 인물다운 것 3~5줄을 그대로 옮긴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const StyleSuggestSchema = z.object({
  name: z.string(),
  tone: z.string(),
  rules: z.string(),
  examples: z.string(),
})

export type StyleSuggestResult = z.infer<typeof StyleSuggestSchema>

export type StyleSuggestInput = { entryName: string; samples: string[] }

export const styleSuggestTask: AiTaskDef<StyleSuggestInput, StyleSuggestResult> = {
  name: 'style-suggest',
  effort: 'medium',
  maxTokens: 4000,
  system: STYLE_SUGGEST_SYSTEM,
  buildPrompt: buildStylePrompt,
  schema: StyleSuggestSchema,
}

function buildStylePrompt(raw: StyleSuggestInput): string {
  const input = neutralizeDeep(raw)
  return [
    `<character>${input.entryName}</character>`,
    '<samples>',
    ...input.samples,
    '</samples>',
  ].join('\n')
}
