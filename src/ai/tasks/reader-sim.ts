import { z } from 'zod'
import type { Persona } from '@/ai/personas'
import type { AiTaskDef } from '@/ai/types'
import { locateQuote, splitSentences } from '@/lib/korean'

// Reader simulation (spec F11): several reader personas react to one chapter.

export const READER_SIM_SYSTEM = `당신은 웹소설 플랫폼의 여러 독자 페르소나를 연기해 회차를 읽고 반응을 남긴다.
규칙:
- <personas>의 페르소나마다 그 성향대로 읽고, 각자 personaId로 답한다. 같은 반응을 복사하지 않는다.
- moments의 quote는 원고 문장을 그대로 인용한다.
- reaction은 confused(헷갈림), bored(지루함), excited(몰입), dropoff(이탈 위험), moved(감동) 중 하나다.
- rating은 1~5 정수, dropOffRisk는 low, medium, high 중 하나다.
- 칭찬과 문제점을 모두 구체적으로 쓰고, 작가가 고칠 수 있는 지점을 짚는다.
- 모든 출력은 한국어로 쓴다.`

const REACTIONS = ['confused', 'bored', 'excited', 'dropoff', 'moved'] as const
const RISKS = ['low', 'medium', 'high'] as const

export const ReaderSimSchema = z.object({
  personas: z.array(
    z.object({
      personaId: z.string(),
      rating: z.number().int(),
      dropOffRisk: z.enum(RISKS),
      overall: z.string(),
      moments: z.array(
        z.object({
          quote: z.string(),
          reaction: z.enum(REACTIONS),
          comment: z.string(),
        }),
      ),
    }),
  ),
  summary: z.string(),
})

export type ReaderSimResult = z.infer<typeof ReaderSimSchema>

export type ReaderSimInput = {
  chapterText: string
  chapterPosition: number
  chapterTitle: string
  previousSummaries: { position: number; summary: string }[]
  work: { title: string; genre: string; logline: string }
  personas: Persona[]
}

export const readerSimTask: AiTaskDef<ReaderSimInput, ReaderSimResult> = {
  name: 'reader-sim',
  effort: 'medium',
  maxTokens: 16000,
  system: READER_SIM_SYSTEM,
  buildPrompt: buildReaderSimPrompt,
  schema: ReaderSimSchema,
  fake: fakeReaderSim,
  postProcess: postProcessReaderSim,
}

function buildReaderSimPrompt(input: ReaderSimInput): string {
  const summaries =
    input.previousSummaries.length > 0
      ? input.previousSummaries.map((s) => `- ${s.position}화: ${s.summary}`).join('\n')
      : '(없음)'
  const personas = input.personas.map((p) => `- ${p.id} (${p.name}): ${p.description}`).join('\n')
  return [
    '<work>',
    `제목: ${input.work.title}`,
    `장르: ${input.work.genre || '(미정)'}`,
    `로그라인: ${input.work.logline || '(없음)'}`,
    '</work>',
    '',
    '<previous_summaries>',
    summaries,
    '</previous_summaries>',
    '',
    '<personas>',
    personas,
    '</personas>',
    '',
    `읽을 회차: ${input.chapterPosition}화 ${input.chapterTitle}`.trimEnd(),
    '<manuscript>',
    input.chapterText,
    '</manuscript>',
  ].join('\n')
}

const FAKE_RATINGS = [4, 3, 5, 2] as const
const FAKE_RISKS = ['low', 'medium', 'low', 'high'] as const

/** Deterministic demo output: quotes the first two sentences of the chapter. */
function fakeReaderSim(input: ReaderSimInput): ReaderSimResult {
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

/** Clamps ratings to 1-5 and drops moment quotes that are not found in the chapter text. */
function postProcessReaderSim(output: ReaderSimResult, input: ReaderSimInput): ReaderSimResult {
  return {
    ...output,
    personas: output.personas.map((persona) => ({
      ...persona,
      rating: Math.min(5, Math.max(1, Math.round(persona.rating))),
      moments: persona.moments
        .map((moment) => ({ ...moment, quote: moment.quote.trim() }))
        .filter((moment) => locateQuote(input.chapterText, moment.quote) !== null),
    })),
  }
}
