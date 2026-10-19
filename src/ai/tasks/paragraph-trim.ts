import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { countSentences, dialogueSpans } from '@/lib/korean/paragraphs'

// Paragraph trim (spec 6, 7): rewrites only the paragraphs that have more sentences than the limit.
// The service in src/server/draft-paragraphs.ts sends the offenders and applies the answer.

export type ParagraphTrimItem = {
  index: number
  text: string
  before: string | null
  after: string | null
}
export type ParagraphTrimInput = { maxSentences: number; items: ParagraphTrimItem[] }

export const ParagraphTrimSchema: z.ZodType<{ paragraphs: { index: number; text: string }[] }> =
  z.object({
    paragraphs: z.array(z.object({ index: z.number(), text: z.string() })),
  })

export type ParagraphTrimOutput = z.infer<typeof ParagraphTrimSchema>

export const PARAGRAPH_TRIM_SYSTEM = `당신은 한국어 웹소설 퇴고를 돕는 보조 작가다. 문장이 너무 많은 문단(<target>)을 <max_sentences>에 맞게 다시 쓴다.
규칙:
- 각 <paragraph>에서 <target>의 문단만 다시 쓴다. <before>와 <after>는 앞뒤 맥락일 뿐이므로 옮기지도 고치지도 않는다.
- 다시 쓴 문단의 각 줄에는 <max_sentences>를 넘는 문장을 두지 않는다.
- 문단을 둘로 나눌 수 있다. 나눈 두 문단은 빈 줄로 구분한다. 세 문단 이상으로 나누지 않는다.
- 사건, 사실, 인물 이름, 설정은 그대로 둔다. 문장 수를 맞추려고 사건이나 사실을 지우지 않는다. 새 내용을 더하지 않는다.
- 따옴표로 묶인 대사는 한 글자도 바꾸지 않고 그대로 옮긴다.
- 인물의 말투, 시점, 시제를 바꾸지 않는다.
- 길이는 원문과 비슷하게 유지한다.
- index는 입력의 값을 그대로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/** Counts without whitespace, so line breaks and spacing do not change the length check. */
function compactLength(text: string): number {
  return text.replace(/\s/g, '').length
}

/**
 * Checks one rewrite of `original`: it differs, every line keeps at most `max` sentences, its
 * length stays near the original, and every quoted span of the original appears verbatim.
 */
export function isValidTrim(original: string, rewrite: string, max: number): boolean {
  const next = rewrite.trim()
  if (next === '' || next === original.trim()) return false
  const lines = next
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.some((line) => countSentences(line) > max)) return false
  const originalLength = compactLength(original)
  if (originalLength === 0) return false
  const ratio = compactLength(next) / originalLength
  if (ratio < 0.75 || ratio > 1.15) return false
  return dialogueSpans(original).every((span) => next.includes(span))
}

/** Trims each part, drops blank parts and joins the rest with a blank line. */
function normalizeParts(text: string): string {
  return text
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n')
}

export const paragraphTrimTask: AiTaskDef<ParagraphTrimInput, ParagraphTrimOutput> = {
  name: 'paragraph-trim',
  effort: 'low',
  maxTokens: 8000,
  system: PARAGRAPH_TRIM_SYSTEM,
  buildPrompt: (input) => {
    const safe = neutralizeDeep(input)
    const items = safe.items.map(
      (item) =>
        `<paragraph index="${item.index}"><before>${item.before ?? ''}</before><target>${item.text}</target><after>${item.after ?? ''}</after></paragraph>`,
    )
    return [`<max_sentences>${safe.maxSentences}</max_sentences>`, ...items].join('\n')
  },
  schema: ParagraphTrimSchema,
  postProcess(output, input) {
    const targets = new Map(input.items.map((item) => [item.index, item.text]))
    const seen = new Set<number>()
    const paragraphs: ParagraphTrimOutput['paragraphs'] = []
    for (const entry of output.paragraphs) {
      const original = targets.get(entry.index)
      // Only the first entry for an index counts, and only indexes that were sent.
      if (original === undefined || seen.has(entry.index)) continue
      seen.add(entry.index)
      const text = normalizeParts(entry.text)
      if (!isValidTrim(original, text, input.maxSentences)) continue
      paragraphs.push({ index: entry.index, text })
    }
    return { paragraphs }
  },
}
