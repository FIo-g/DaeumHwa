import { z } from 'zod'
import type { AiTaskDef } from '@/ai/types'
import { locateQuote } from '@/lib/korean/sentences'

// Proofreading (F14): AI suggestions for spelling, spacing, grammar and awkward phrasing.
// Rule-based checks run separately (src/lib/korean/spelling-rules.ts).

export const PROOFREAD_KINDS = ['spelling', 'spacing', 'grammar', 'awkward'] as const
export type ProofreadKind = (typeof PROOFREAD_KINDS)[number]

export const ProofreadSchema = z.object({
  suggestions: z.array(
    z.object({
      quote: z.string(),
      replacement: z.string(),
      kind: z.enum(PROOFREAD_KINDS),
      reason: z.string(),
    }),
  ),
})

export type ProofreadOutput = z.infer<typeof ProofreadSchema>

export const PROOFREAD_SYSTEM = `당신은 한국어 웹소설 교정자다. 원고에서 맞춤법, 띄어쓰기, 문법 오류와 어색한 표현을 찾아 고칠 표현을 제안한다.
규칙:
- quote에는 고칠 부분을 원고 그대로, 가능한 한 짧게(어절이나 구) 옮긴다.
- replacement에는 quote를 대신할 고친 표현을 쓴다.
- 대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다. 문체를 바꾸는 제안은 하지 않는다.
- kind는 spelling(맞춤법), spacing(띄어쓰기), grammar(문법), awkward(어색한 표현) 중 하나다.
- reason에는 왜 고치는지 한 문장으로 쓴다.
- 모든 출력은 한국어로 쓴다.`

export const proofreadTask: AiTaskDef<{ text: string }, ProofreadOutput> = {
  name: 'proofread',
  effort: 'medium',
  maxTokens: 16000,
  system: PROOFREAD_SYSTEM,
  buildPrompt: ({ text }) => `<manuscript>\n${text}\n</manuscript>`,
  schema: ProofreadSchema,
  fake: () => ({ suggestions: [] }),
  postProcess(output, input) {
    const suggestions: ProofreadOutput['suggestions'] = []
    for (const s of output.suggestions) {
      if (s.quote.trim() === '' || s.replacement === s.quote) continue
      const range = locateQuote(input.text, s.quote)
      if (!range) continue
      // Keep the quote exactly as it appears in the manuscript, even if the model normalized spaces.
      suggestions.push({ ...s, quote: input.text.slice(range.start, range.end) })
    }
    return { suggestions }
  },
}
