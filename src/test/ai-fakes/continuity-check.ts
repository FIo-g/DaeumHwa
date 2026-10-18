import type { ContextPack } from '@/ai/context'
import type {
  ContinuityInput,
  ContinuityIssue,
  ContinuityOutput,
} from '@/ai/tasks/continuity-check'
import type { Severity } from '@/db/types'
import { splitSentences } from '@/lib/korean/sentences'

// Stand-in output for the continuity-check task. Used only by tests (see src/test/fake-ai.ts).

/** Deterministic stand-in: left/right hand and age contradictions between a wiki fact and a sentence about the same subject. */
export function fakeContinuity(input: ContinuityInput): ContinuityOutput {
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
