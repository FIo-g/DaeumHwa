// Draft repair (spec 6, 7): rewrites only the sentences that the draft flags (sample copies and
// over-repeated words) found. The service in src/server/ai-features.ts runs it once on the
// finished draft. applyDraftEdits applies the answer and checks that every edit lies in a flag.

import { z } from 'zod'
import { type ForeignSpan, foreignScriptSpans } from '@/ai/guards'
import { neutralizeTags, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { DRAFT_ERROR_MARK } from '@/lib/draft-stream'
import { locateQuote } from '@/lib/korean/sentences'
import type { DraftFlag } from '@/lib/korean/style-copy'

export type DraftEdit = { quote: string; replacement: string }
export type DraftRepairInput = { text: string; flags: DraftFlag[] }
export type DraftRepairOutput = { edits: DraftEdit[] }

export const DraftRepairSchema: z.ZodType<DraftRepairOutput> = z.object({
  edits: z.array(z.object({ quote: z.string(), replacement: z.string() })),
})

export const DRAFT_REPAIR_SYSTEM = `당신은 웹소설 퇴고를 돕는 보조 작가다. 원고에서 표시된 문장(<flags>)만 다시 쓴다.
규칙:
- flags의 각 줄은 [종류] 뒤에 원고 문장을 그대로 옮긴 것이다. sample-copy는 문체 카드 견본과 거의 같은 문장이므로, 사건과 뜻은 두고 표현과 이미지를 새로 쓴다. repeated-word는 같은 말이 너무 많이 나오는 문장이므로, 그 말을 다른 표현이나 대명사로 바꾸거나 줄인다.
- edits의 quote에는 flags의 문장을 원고 그대로 옮기고, replacement에는 다시 쓴 문장만 쓴다.
- 사건, 사실, 인물 말투, 시점, 시제는 바꾸지 않고 길이는 비슷하게 유지한다.
- flags에 없는 문장은 고치지 않는다.
${TAG_DATA_RULE}
- 원고와 같은 언어로 쓴다.`

/**
 * Sent only with foreign-script flags, which only the local foreign-script repair produces. Keeping
 * it out of DRAFT_REPAIR_SYSTEM keeps the cloud system prompt unchanged. It is plain text, not in a
 * tag, since TAG_DATA_RULE treats tag content as data.
 */
export const FOREIGN_SCRIPT_RULE = `추가 규칙:
- foreign-script는 한글이 아닌 글자(한자, 일본어 가나, 키릴 문자)가 섞인 문장이다. 섞인 부분만 같은 뜻의 자연스러운 한글 표현으로 바꾸고, 바꾼 부분에는 한글과 문장부호만 쓴다. 섞인 부분 밖의 숫자와 영문은 그대로 두고, 줄바꿈은 넣지 않는다.`

/**
 * The foreign-script spans a Korean draft must not keep: Han, kana, Cyrillic and U+FFFD. Latin runs
 * are left out, since a Korean draft may quote English on purpose. Detection is GUARDS' (src/ai/guards).
 */
export function repairableForeignSpans(text: string): ForeignSpan[] {
  return foreignScriptSpans(text, 'ko').filter(
    (span) => span.script !== 'latin' && span.script !== 'hangul',
  )
}

/**
 * A foreign-script rewrite stays one line, keeps out foreign script and the error mark, and keeps
 * every digit run and Latin word of the quote that it had.
 */
function isCleanForeignRepair(quote: string, replacement: string): boolean {
  if (/[\r\n]/.test(replacement) || replacement.includes(DRAFT_ERROR_MARK)) return false
  if (repairableForeignSpans(replacement).length > 0) return false
  const kept = quote.match(/[0-9A-Za-z]+/g) ?? []
  return kept.every((run) => replacement.includes(run))
}

export const draftRepairTask: AiTaskDef<DraftRepairInput, DraftRepairOutput> = {
  name: 'draft-repair',
  effort: 'medium',
  maxTokens: 8000,
  // The product default (120 s) is too short for a repair on a slow model.
  timeoutMs: 180_000,
  system: DRAFT_REPAIR_SYSTEM,
  buildPrompt: ({ text, flags }) => {
    const prompt = `<manuscript>\n${neutralizeTags(text)}\n</manuscript>\n\n<flags>\n${flags
      .map((flag, i) => `${i + 1}. [${flag.kind}] ${neutralizeTags(flag.quote)}`)
      .join('\n')}\n</flags>`
    return flags.some((flag) => flag.kind === 'foreign-script')
      ? `${FOREIGN_SCRIPT_RULE}\n\n${prompt}`
      : prompt
  },
  schema: DraftRepairSchema,
  postProcess(output, input) {
    const edits: DraftEdit[] = []
    for (const edit of output.edits) {
      const quote = edit.quote.trim()
      const replacement = edit.replacement.trim()
      if (quote === '' || replacement === '' || replacement === quote) continue
      const flag = input.flags.find((candidate) => candidate.quote.trim().includes(quote))
      if (!flag) continue
      if (flag.kind === 'foreign-script' && !isCleanForeignRepair(quote, replacement)) continue
      edits.push({ quote, replacement })
    }
    return { edits }
  },
}

/**
 * Applies the edits to `text`. An edit is accepted only when its quote sits inside a flag that no
 * earlier edit used, so nothing outside a flagged sentence changes. Edits that overlap an accepted
 * one are skipped.
 */
export function applyDraftEdits(
  text: string,
  flags: readonly DraftFlag[],
  edits: readonly DraftEdit[],
): { text: string; applied: number } {
  const used = new Set<number>()
  const accepted: { start: number; end: number; replacement: string }[] = []
  for (const edit of edits) {
    const quote = edit.quote.trim()
    const replacement = edit.replacement.trim()
    if (quote === '' || replacement === '') continue
    const index = flags.findIndex((flag, i) => !used.has(i) && flag.quote.trim().includes(quote))
    if (index === -1) continue
    const flag = flags[index]
    const range = locateQuote(text, quote, flag.start)
    if (range === null) continue
    if (flag.start > range.start || range.end > flag.end) continue
    used.add(index)
    if (accepted.some((other) => range.start < other.end && other.start < range.end)) continue
    accepted.push({ start: range.start, end: range.end, replacement })
  }

  // Apply from the last offset to the first, so earlier offsets stay valid.
  let result = text
  for (const edit of [...accepted].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }
  return { text: result, applied: accepted.length }
}
