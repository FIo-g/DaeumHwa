import { z } from 'zod'
import { type ContextPack, renderContextPack, resolveRefs } from '@/ai/context'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { ISSUE_KINDS, type IssueKind, SEVERITIES, type Severity } from '@/db/types'
import { locateQuote, splitSentences } from '@/lib/korean/sentences'

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
- quote에는 문제가 되는 원고 문장을 한 글자도 바꾸지 말고 그대로 옮긴다.
- wikiExcerpt에는 근거가 된 위키 문구를 그대로 옮기고, factRef 또는 entryRef에 그 ref를 넣는다.
- 위키의 사실에 "N화부터", "~N화" 같은 유효 범위가 있으면 이 회차 시점에 유효한 것만 기준으로 삼는다. 이야기 속에서 상태가 바뀌는 전개 자체는 오기가 아니다. 설명 없이 위키와 어긋날 때만 지적한다.
- [가정]이나 [미정] 사실과 어긋나면 severity를 "low"로 두고 explanation에 "가정/미정 설정과 다릅니다"라고 밝힌다.
- 표기 규칙(<naming>) 위반, 심지 않은 떡밥을 회수하는 문제, 시간선 모순도 찾는다.
- suggestion에는 원고를 고친 문장을 쓰거나, 위키를 고쳐야 할 수도 있다고 제안한다.
- 확신이 없으면 지적하지 않는다. 지적할 것이 없으면 빈 배열을 돌려준다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

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

/** Deterministic stand-in: left/right hand and age contradictions between a wiki fact and a sentence about the same subject. */
function fakeContinuity(input: ContinuityInput): ContinuityOutput {
  const sentences = splitSentences(input.chapterText)
  const issues: ContinuityIssue[] = []
  for (const entry of input.pack.entries) {
    const names = [entry.name, ...entry.aliases]
    const subjectSentences = sentences.filter((s) => names.some((n) => s.text.includes(n)))
    for (const fact of entry.facts) {
      const handIssue = fakeHandIssue(fact, subjectSentences)
      const ageIssue = handIssue ? null : fakeAgeIssue(fact, subjectSentences)
      const found = handIssue ?? ageIssue
      if (!found) continue
      issues.push({
        quote: found.quote,
        kind: 'contradiction',
        severity: fact.status === 'confirmed' ? found.severity : 'low',
        factRef: fact.ref,
        entryRef: entry.ref,
        wikiExcerpt: fact.content,
        explanation:
          fact.status === 'confirmed'
            ? found.explanation
            : `가정/미정 설정과 다릅니다. ${found.explanation}`,
        suggestion: found.suggestion,
      })
    }
  }
  return { issues }
}

function fakeHandIssue(
  fact: ContextPack['entries'][number]['facts'][number],
  subjectSentences: { text: string }[],
): { quote: string; severity: Severity; explanation: string; suggestion: string } | null {
  const factHand = fact.content.includes('왼손')
    ? '왼손'
    : fact.content.includes('오른손')
      ? '오른손'
      : null
  if (!factHand) return null
  const otherHand = factHand === '왼손' ? '오른손' : '왼손'
  const sentence = subjectSentences.find((s) => s.text.includes(otherHand))
  if (!sentence) return null
  return {
    quote: sentence.text,
    severity: 'medium',
    explanation: `위키는 ${factHand}으로 설정되어 있는데 원고는 ${otherHand}을 씁니다.`,
    suggestion: sentence.text.replace(otherHand, factHand),
  }
}

function fakeAgeIssue(
  fact: ContextPack['entries'][number]['facts'][number],
  subjectSentences: { text: string }[],
): { quote: string; severity: Severity; explanation: string; suggestion: string } | null {
  const factAge = /(\d+)\s*살/.exec(fact.content)?.[1]
  if (!factAge) return null
  for (const sentence of subjectSentences) {
    const match = /(\d+)\s*살/.exec(sentence.text)
    if (!match || match[1] === factAge) continue
    return {
      quote: sentence.text,
      severity: 'medium',
      explanation: `위키의 나이(${factAge}살)와 원고의 나이(${match[1]}살)가 다릅니다.`,
      suggestion: sentence.text.replace(match[0], `${factAge}살`),
    }
  }
  return null
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
  fake: fakeContinuity,
  postProcess(output, input) {
    return {
      issues: locateIssues(output, input).map((l) => ({
        ...l.issue,
        factRef: l.issue.factRef,
        entryRef: l.issue.entryRef,
      })),
    }
  },
}
