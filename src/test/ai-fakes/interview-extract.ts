import type { Extraction } from '@/ai/extraction'
import type { InterviewExtractInput } from '@/ai/tasks/interview-extract'
import { stripJosa } from '@/lib/korean'

// Stand-in output for the interview-extract task. Used only by tests (see src/test/fake-ai.ts).

/** The first sentence of the answer (ends at . ! ? or a line break). */
function firstSentence(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+|\n+/)
  return (parts[0] ?? '').trim() || text
}

/** First run of two or more Hangul syllables, with trailing particles stripped (서윤은 -> 서윤). */
function firstNameToken(text: string): string {
  const match = text.match(/[가-힣]{2,}/)
  return match ? stripJosa(match[0]) : ''
}

/** Deterministic output: one fact from the first sentence, plus a protagonist/character card or a planted thread by topic. */
export function fakeInterviewExtraction(input: InterviewExtractInput): Extraction {
  const answer = input.answer.trim()
  const sentence = firstSentence(answer)
  const token = firstNameToken(answer)
  const knownNames = new Set(
    input.known.flatMap((k) => [stripJosa(k.name), ...k.aliases.map((a) => stripJosa(a))]),
  )

  const entries: Extraction['entries'] = []
  if (
    (input.topic === '주인공' || input.topic === '주요 인물') &&
    token !== '' &&
    !knownNames.has(token)
  ) {
    entries.push({ name: token, kind: 'character', aliases: [], summary: sentence, fields: [] })
  }

  const threads: Extraction['threads'] = []
  const planted = Array.from(answer).slice(0, 20).join('')
  // A planted thread already listed in <threads> (existing or pending) is not proposed again.
  const listedTitles = new Set(input.threads.map((t) => t.title.trim()))
  if ((input.topic === '떡밥' || input.focus === 'story') && !listedTitles.has(planted)) {
    threads.push({
      title: planted,
      description: answer,
      kind: 'planted',
      evidence: sentence,
      existingThreadRef: null,
      targetChapterPosition: null,
    })
  }

  return {
    summary: null,
    entries,
    facts: [
      {
        subjectName: token,
        content: sentence,
        evidence: sentence,
        suggestedStatus: 'assumed',
        supersedesFactRef: null,
      },
    ],
    threads,
    relations: [],
  }
}
