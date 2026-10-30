import { z } from 'zod'
import type { Persona } from '@/ai/personas'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { chapterLabel } from '@/lib/labels'
import { locateQuote } from '@/lib/korean'

// Reader simulation (spec F11): several reader personas react to one chapter.

/**
 * A cloud call carries all four personas in one request; one saved call took 231 s. The route's
 * maxDuration is 300 s, so 30 s are left, like the 280 s stream limit.
 */
export const READER_SIM_CLOUD_TIMEOUT_MS = 270_000

const WHITESPACE = /\s/

export const READER_SIM_SYSTEM = `당신은 웹소설 플랫폼의 여러 독자 페르소나를 연기해 회차를 읽고 반응을 남긴다.
규칙:
- <personas>의 페르소나마다 그 성향대로 읽고, 각자 personaId로 답한다. 같은 반응을 복사하지 않는다.
- moments의 quote는 원고 문장을 그대로 인용한다.
- reaction은 confused(헷갈림), bored(지루함), excited(몰입), dropoff(이탈 위험), moved(감동) 중 하나다.
- rating은 1~5 정수, dropOffRisk는 low, medium, high 중 하나다.
- 칭찬과 문제점을 모두 구체적으로 쓰고, 작가가 고칠 수 있는 지점을 짚는다.
- 이전 회차에 대해서는 <previous_summaries>에 적힌 내용만 말한다. 거기에 없는 이전 회차를 읽었다거나, 이전 회차에서 비슷한 표현을 본 적 있다고 쓰지 않는다. (없음)이면 이번 원고만 근거로 삼는다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const REACTIONS = ['confused', 'bored', 'excited', 'dropoff', 'moved'] as const
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
  postProcess: postProcessReaderSim,
}

function buildReaderSimPrompt(raw: ReaderSimInput): string {
  const input = neutralizeDeep(raw)
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
    `읽을 회차: ${chapterLabel(input.chapterPosition, input.chapterTitle)}`,
    '<manuscript>',
    input.chapterText,
    '</manuscript>',
  ].join('\n')
}

/**
 * Finds `quote` in `text` ignoring letter case and all whitespace. Offsets are into `text`.
 * The slice between them keeps the manuscript's own wording and spacing.
 */
export function locateLooseQuote(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const needle = foldForMatch(quote).folded
  if (needle === '') return null
  const hay = foldForMatch(text)
  const at = hay.folded.indexOf(needle)
  if (at === -1) return null
  return { start: hay.map[at], end: hay.map[at + needle.length - 1] + 1 }
}

/**
 * Lower-cases `text` and drops whitespace. `map[k]` is the original index of folded unit `k`. A
 * character whose lower case has two units maps both units to its original index.
 */
function foldForMatch(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i)
    if (WHITESPACE.test(ch)) continue
    const lower = ch.toLowerCase()
    for (let k = 0; k < lower.length; k += 1) {
      folded += lower.charAt(k)
      map.push(i)
    }
  }
  return { folded, map }
}

/**
 * Clamps ratings to 1-5 and drops moment quotes that are not found in the chapter text, ignoring
 * letter case and spacing. A quote found only that way is stored as the manuscript's own wording.
 */
function postProcessReaderSim(output: ReaderSimResult, input: ReaderSimInput): ReaderSimResult {
  return {
    ...output,
    personas: output.personas.map((persona) => ({
      ...persona,
      rating: Math.min(5, Math.max(1, Math.round(persona.rating))),
      moments: persona.moments.flatMap((moment) => {
        const quote = moment.quote.trim()
        if (locateQuote(input.chapterText, quote) !== null) return [{ ...moment, quote }]
        const loose = locateLooseQuote(input.chapterText, quote)
        if (loose === null) return []
        return [{ ...moment, quote: input.chapterText.slice(loose.start, loose.end) }]
      }),
    })),
  }
}

/** One input per persona. Each keeps the same chapter, summaries and work, so one call reads as one reader. */
export function splitReaderSimInput(input: ReaderSimInput): ReaderSimInput[] {
  return input.personas.map((persona) => ({ ...input, personas: [persona] }))
}

/**
 * Joins per-persona outputs back into one result, in the order given. A persona that appears twice
 * keeps its first output. The summary is the distinct non-empty summaries, one per line.
 */
export function mergeReaderSim(outputs: ReaderSimResult[]): ReaderSimResult {
  const seen = new Set<string>()
  const personas: ReaderSimResult['personas'] = []
  for (const output of outputs) {
    for (const persona of output.personas) {
      if (seen.has(persona.personaId)) continue
      seen.add(persona.personaId)
      personas.push(persona)
    }
  }
  const summaries = new Set<string>()
  for (const output of outputs) {
    const summary = output.summary.trim()
    if (summary !== '') summaries.add(summary)
  }
  return { personas, summary: [...summaries].join('\n') }
}
