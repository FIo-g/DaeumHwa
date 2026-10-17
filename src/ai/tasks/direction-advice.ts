import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import type { ThreadStatus } from '@/db/types'
import { THREAD_STATUS_LABEL } from '@/lib/labels'

// Direction advice (spec F12): three next-arc options from open threads, characters and recent summaries.

export const ADVICE_SYSTEM = `당신은 장기 연재 웹소설의 편집자다. 열린 떡밥, 인물 상태, 최근 전개를 보고 다음 전개 선택지를 제안한다.
규칙:
- 선택지는 정확히 3개이고, 서로 방향이 분명히 달라야 한다.
- 각 선택지는 위키의 떡밥(usesThreads: 떡밥 제목)과 인물(involvedCharacters: 카드 이름)을 활용한다. 위키에 없는 대상을 새로 만들지 말고, 필요하면 risk에 "새 인물 필요"처럼 적는다.
- beats에는 다음 화에서 일어날 일을 순서대로 3~5개 쓴다.
- warnings에는 회수 목표가 지난 떡밥, 오래 등장하지 않은 주요 인물처럼 작가가 놓치기 쉬운 점을 쓴다.
- recommendedIndex에 가장 추천하는 선택지 번호(0~2)를, recommendationReason에 그 이유를 쓴다.
- 결정은 작가가 한다. 단정하지 말고 제안하는 말투로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

const MAX_OPTIONS = 3

export const AdviceSchema = z.object({
  options: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      beats: z.array(z.string()),
      usesThreads: z.array(z.string()),
      involvedCharacters: z.array(z.string()),
      risk: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
  recommendedIndex: z.number().int(),
  recommendationReason: z.string(),
})

export type AdviceResult = z.infer<typeof AdviceSchema>

export type AdviceInput = {
  work: { title: string; genre: string; logline: string; synopsis: string }
  latestPosition: number
  threads: {
    title: string
    description: string
    status: ThreadStatus
    plantedPosition: number | null
    targetPosition: number | null
    overdue: boolean
  }[]
  characters: { name: string; summary: string; lastPosition: number | null; keyFacts: string[] }[]
  recentSummaries: { position: number; title: string; summary: string }[]
}

export const directionAdviceTask: AiTaskDef<AdviceInput, AdviceResult> = {
  name: 'direction-advice',
  effort: 'high',
  maxTokens: 16000,
  system: ADVICE_SYSTEM,
  buildPrompt: buildAdvicePrompt,
  schema: AdviceSchema,
  fake: fakeAdvice,
  postProcess: postProcessAdvice,
}

function buildAdvicePrompt(raw: AdviceInput): string {
  const input = neutralizeDeep(raw)
  const threads = input.threads.length > 0 ? input.threads.map(renderThread).join('\n') : '(없음)'
  const characters =
    input.characters.length > 0 ? input.characters.map(renderCharacter).join('\n') : '(없음)'
  const summaries =
    input.recentSummaries.length > 0
      ? input.recentSummaries
          .map(
            (s) => `- ${s.position}화${s.title.trim() ? ` ${s.title.trim()}` : ''}: ${s.summary}`,
          )
          .join('\n')
      : '(없음)'
  return [
    '<work>',
    `제목: ${input.work.title}`,
    `장르: ${input.work.genre || '(미정)'}`,
    `로그라인: ${input.work.logline || '(없음)'}`,
    `시놉시스: ${input.work.synopsis || '(없음)'}`,
    `현재까지 연재된 회차: ${input.latestPosition}화`,
    '</work>',
    '',
    '<threads>',
    threads,
    '</threads>',
    '',
    '<characters>',
    characters,
    '</characters>',
    '',
    '<recent_summaries>',
    summaries,
    '</recent_summaries>',
  ].join('\n')
}

function renderThread(thread: AdviceInput['threads'][number]): string {
  const meta = [THREAD_STATUS_LABEL[thread.status]]
  if (thread.plantedPosition !== null) meta.push(`${thread.plantedPosition}화에 심음`)
  if (thread.targetPosition !== null) meta.push(`목표 ${thread.targetPosition}화`)
  if (thread.overdue) meta.push('지연')
  const description = thread.description ? `: ${thread.description}` : ''
  return `- ${thread.title} (${meta.join(', ')})${description}`
}

function renderCharacter(character: AdviceInput['characters'][number]): string {
  const last =
    character.lastPosition !== null ? `최근 등장 ${character.lastPosition}화` : '등장 기록 없음'
  const lines = [`- ${character.name} (${last})`]
  if (character.summary) lines.push(`  요약: ${character.summary}`)
  for (const fact of character.keyFacts) lines.push(`  사실: ${fact}`)
  return lines.join('\n')
}

/** Demo output: three options built from the first open thread and character, if any. */
function fakeAdvice(input: AdviceInput): AdviceResult {
  const thread = input.threads[0]?.title
  const character = input.characters[0]?.name
  const threadUse = thread ? [thread] : []
  const characterUse = character ? [character] : []
  const warnings = [
    ...input.threads
      .filter((t) => t.overdue)
      .map((t) => `"${t.title}" 떡밥의 회수 목표가 지났습니다.`),
    ...input.characters
      .filter((c) => c.lastPosition !== null && input.latestPosition - c.lastPosition >= 5)
      .map((c) => `${c.name}이(가) 오래 등장하지 않았습니다.`),
  ]
  return {
    options: [
      {
        title: '(데모) 정면 대결',
        summary: '숨겨 둔 갈등을 드러내고 인물들이 정면으로 부딪힌다.',
        beats: ['갈등이 드러난다', '인물이 선택을 강요받는다', '결과가 다음 화로 이어진다'],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '전개가 빨라져 독자가 따라오기 어려울 수 있습니다.',
      },
      {
        title: '(데모) 잠복과 관찰',
        summary: '인물이 한발 물러서 상황을 살피며 단서를 모은다.',
        beats: ['새 단서를 발견한다', '인물이 몰래 조사한다', '의외의 인물이 등장한다'],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '긴장이 느슨해질 수 있습니다.',
      },
      {
        title: '(데모) 뜻밖의 동행',
        summary: '적대적이던 인물과 손을 잡고 새로운 관계를 연다.',
        beats: [
          '뜻밖의 제안이 온다',
          '두 인물이 임시로 손을 잡는다',
          '서로의 비밀이 조금씩 드러난다',
        ],
        usesThreads: threadUse,
        involvedCharacters: characterUse,
        risk: '새 인물 필요 여부를 확인해 보세요.',
      },
    ],
    warnings,
    recommendedIndex: 0,
    recommendationReason: '(데모) 열린 떡밥을 가장 직접적으로 회수할 수 있는 방향입니다.',
  }
}

/** Keeps at most three options and clamps the recommended index into range. */
function postProcessAdvice(output: AdviceResult): AdviceResult {
  const options = output.options.slice(0, MAX_OPTIONS)
  const last = Math.max(0, options.length - 1)
  return {
    ...output,
    options,
    recommendedIndex: Math.min(Math.max(0, output.recommendedIndex), last),
  }
}
