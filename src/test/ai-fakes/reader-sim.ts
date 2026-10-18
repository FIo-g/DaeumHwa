import type { ReaderSimInput, ReaderSimResult } from '@/ai/tasks/reader-sim'
import { REACTIONS } from '@/ai/tasks/reader-sim'
import { splitSentences } from '@/lib/korean'

// Stand-in output for the reader-sim task. Used only by tests (see src/test/fake-ai.ts).

const FAKE_RATINGS = [4, 3, 5, 2] as const
const FAKE_RISKS = ['low', 'medium', 'low', 'high'] as const

/** Deterministic demo output: quotes the first two sentences of the chapter. */
export function fakeReaderSim(input: ReaderSimInput): ReaderSimResult {
  const quotes = splitSentences(input.chapterText)
    .map((s) => s.text.trim())
    .filter((text) => text.length > 0)
    .slice(0, 2)
  return {
    personas: input.personas.map((persona, index) => ({
      personaId: persona.id,
      rating: FAKE_RATINGS[index % FAKE_RATINGS.length],
      dropOffRisk: FAKE_RISKS[index % FAKE_RISKS.length],
      overall: `${persona.name} 관점에서 이번 화는 무난하게 읽힙니다. (데모 응답)`,
      moments: quotes.map((quote, j) => ({
        quote,
        reaction: REACTIONS[(index + j) % REACTIONS.length],
        comment: '(데모) 이 장면의 흐름을 한 번 더 점검해 보세요.',
      })),
    })),
    summary: '(데모) 독자 반응이 전반적으로 무난합니다. 도입부의 설명 분량을 확인해 보세요.',
  }
}
