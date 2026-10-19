import { z } from 'zod'
import { type ContextPack, renderContextPack, resolveRefs } from '@/ai/context'
import { findNumericFactMismatches } from '@/ai/numeric-facts'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { ISSUE_KINDS, type IssueKind, SEVERITIES, type Severity } from '@/db/types'
import { locateQuote } from '@/lib/korean/sentences'

// Continuity check (F7): finds places where the manuscript contradicts the approved wiki.
// Every issue must quote the manuscript and point at a wiki fact or entry, or it is dropped.

export const ContinuitySchema = z.object({
  issues: z.array(
    z.object({
      quote: z.string(),
      kind: z.enum(ISSUE_KINDS),
      severity: z.enum(SEVERITIES),
      factRef: z.string().nullable(),
      entryRef: z.string().nullable(),
      wikiExcerpt: z.string(),
      explanation: z.string(),
      suggestion: z.string(),
    }),
  ),
})

export type ContinuityOutput = z.infer<typeof ContinuitySchema>
export type ContinuityIssue = ContinuityOutput['issues'][number]

export type ContinuityInput = {
  chapterText: string
  chapterPosition: number
  chapterTitle: string
  pack: ContextPack
}

/** An issue after post-processing: quote located in the chapter, refs resolved to record ids. */
export type ResolvedContinuityIssue = {
  quote: string
  start: number
  end: number
  kind: IssueKind
  severity: Severity
  factId: string | null
  entryId: string | null
  wikiExcerpt: string
  explanation: string
  suggestion: string
}

export const CONTINUITY_SYSTEM = `당신은 장기 연재 웹소설의 설정 오류(오기)를 찾는 교정자다. <wiki>는 작가가 승인한 설정 위키이고, <manuscript>는 점검할 회차 원고다.
규칙:
- <wiki>의 사실(F ref)이나 카드(E ref)와 원고 문장이 어긋나는 곳만 지적한다. 위키 근거가 없는 지적은 하지 않는다.
- 원고가 위키의 내용을 언급하지 않았거나 위키에 없는 내용을 새로 쓴 것은 모순이 아니다. 위키와 정면으로 어긋나는 문장만 지적하고, "언급이 없다"는 이유로는 지적하지 않는다.
- quote에는 문제가 되는 원고 문장을 한 글자도 바꾸지 말고 그대로 옮긴다.
- wikiExcerpt에는 근거가 된 위키 문구를 그대로 옮기고, factRef 또는 entryRef에 그 ref를 넣는다.
- 위키의 사실에 "N화부터", "~N화" 같은 유효 범위가 있으면 이 회차 시점에 유효한 것만 기준으로 삼는다. 이야기 속에서 상태가 바뀌는 전개 자체는 오기가 아니다. 설명 없이 위키와 어긋날 때만 지적한다.
- [가정]이나 [미정] 사실과 어긋나면 severity를 "low"로 두고 explanation에 "가정/미정 설정과 다릅니다"라고 밝힌다.
- 표기 규칙(<naming>) 위반, 심지 않은 떡밥을 회수하는 문제, 시간선 모순도 찾는다.
- suggestion에는 quote를 통째로 바꿔 넣을 수 있는 완성된 고친 문장만 쓴다. 문장을 고쳐서 풀 수 없는 문제(떡밥 회수, 시간선, 위키를 고쳐야 하는 경우)는 suggestion을 빈 문자열("")로 두고, 조언은 explanation에 쓴다.
- 확신이 없으면 지적하지 않는다. 지적할 것이 없으면 빈 배열을 돌려준다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/**
 * The UI applies suggestion as replacement text for the quote, so only a real sentence fix may stay.
 * Thread and timeline issues need advice, and a suggestion that repeats the quote changes nothing.
 */
function usableSuggestion(issue: ContinuityIssue): string {
  if (issue.kind === 'thread' || issue.kind === 'timeline') return ''
  if (issue.suggestion.trim() === issue.quote.trim()) return ''
  return issue.suggestion
}

/**
 * Age mismatches found in code (numeric-facts), as contradiction issues. They do not depend on the
 * model answer. A bug here must not fail the whole check, so any error gives no numeric issues.
 */
function numericIssues(input: ContinuityInput): ContinuityIssue[] {
  try {
    return findNumericFactMismatches({ chapterText: input.chapterText, pack: input.pack }).map(
      (hit) => ({
        quote: hit.quote,
        kind: 'contradiction',
        severity: 'medium',
        factRef: hit.factRef,
        entryRef: hit.entryRef,
        wikiExcerpt: hit.wikiExcerpt,
        explanation: hit.explanation,
        suggestion: hit.suggestion,
      }),
    )
  } catch {
    return []
  }
}

/**
 * Locates each issue's quote in the chapter and resolves its refs. Drops issues whose quote is not
 * in the chapter, issues with neither a valid fact nor a valid entry ref, and duplicate ranges.
 */
function locateIssues(
  output: ContinuityOutput,
  input: ContinuityInput,
): {
  issue: ContinuityIssue
  start: number
  end: number
  factId: string | null
  entryId: string | null
}[] {
  const { facts, entries } = resolveRefs(input.pack)
  const located: ReturnType<typeof locateIssues> = []
  const seen = new Set<string>()
  for (const issue of output.issues) {
    const range = locateQuote(input.chapterText, issue.quote)
    if (!range) continue

    const fact = issue.factRef === null ? undefined : facts.get(issue.factRef)
    const entry = issue.entryRef === null ? undefined : entries.get(issue.entryRef)
    if (!fact && !entry) continue

    const key = `${range.start}:${range.end}`
    if (seen.has(key)) continue
    seen.add(key)

    located.push({
      issue: {
        ...issue,
        quote: input.chapterText.slice(range.start, range.end),
        factRef: fact ? issue.factRef : null,
        entryRef: entry ? issue.entryRef : null,
      },
      start: range.start,
      end: range.end,
      factId: fact?.id ?? null,
      entryId: entry?.id ?? fact?.entryId ?? null,
    })
  }
  return located
}

/** Post-processed issues with record ids and quote offsets (used by chapter-check). */
export function resolveContinuityIssues(
  output: ContinuityOutput,
  input: ContinuityInput,
): ResolvedContinuityIssue[] {
  return locateIssues(output, input).map((l) => ({
    quote: l.issue.quote,
    start: l.start,
    end: l.end,
    kind: l.issue.kind,
    severity: l.issue.severity,
    factId: l.factId,
    entryId: l.entryId,
    wikiExcerpt: l.issue.wikiExcerpt,
    explanation: l.issue.explanation,
    suggestion: l.issue.suggestion,
  }))
}

export const continuityCheckTask: AiTaskDef<ContinuityInput, ContinuityOutput> = {
  name: 'continuity-check',
  effort: 'high',
  maxTokens: 16000,
  system: CONTINUITY_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    return [
      `<wiki>\n${renderContextPack(input.pack)}\n</wiki>`,
      '',
      `<manuscript position="${input.chapterPosition}" title="${input.chapterTitle.replace(/"/g, "'")}">`,
      input.chapterText,
      '</manuscript>',
    ].join('\n')
  },
  schema: ContinuitySchema,
  postProcess(output, input) {
    // Numeric issues go first, so they win the same-range dedupe over a model issue.
    const combined = { issues: [...numericIssues(input), ...output.issues] }
    return {
      issues: locateIssues(combined, input).map((l) => ({
        ...l.issue,
        factRef: l.issue.factRef,
        entryRef: l.issue.entryRef,
        suggestion: usableSuggestion(l.issue),
      })),
    }
  },
}
