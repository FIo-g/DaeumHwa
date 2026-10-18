import { z } from 'zod'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { EntryKind } from '@/db/types'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'

// interview-question (F1): picks the next interview question from the current wiki state and the
// recent Q&A. Output is one question; the service stores it as an interview turn.

export type InterviewQuestionInput = {
  work: { title: string; genre: string; logline: string; synopsis: string }
  wiki: {
    counts: Record<EntryKind, number>
    entryNames: string[]
    openThreadTitles: string[]
  }
  history: { topic: string; question: string; answer: string | null; skipped: boolean }[]
}

export type InterviewQuestion = { topic: string; question: string; rationale: string }

const InterviewQuestionSchema = z.object({
  topic: z.string(),
  question: z.string(),
  rationale: z.string(),
})

/** Core topics the interview covers, in order. */
export const INTERVIEW_TOPICS = [
  '주인공',
  '주요 인물',
  '세계관 규칙',
  '주요 장소',
  '중심 갈등',
  '떡밥',
  '결말 방향',
  '문체',
] as const

const SYSTEM = [
  '당신은 웹소설 작가의 기획을 돕는 인터뷰어다. 작가의 설정 위키를 채우기 위해 질문을 한 번에 하나만 한다.',
  '규칙:',
  '- 이미 묻거나 건너뛴 주제는 반복하지 않는다.',
  '- 위키에서 비어 있는 부분(주인공, 주요 인물, 세계관 규칙, 장소, 갈등, 떡밥, 결말 방향, 문체)을 우선한다.',
  '- 질문은 구체적이고 답하기 쉽게 한두 문장으로 쓴다. 예시 답을 늘어놓지 않는다.',
  '- topic에는 주제 이름을, rationale에는 이 질문이 위키의 어느 부분을 채우는지 한 문장으로 쓴다.',
  TAG_DATA_RULE,
  '- 모든 출력은 한국어로 쓴다.',
].join('\n')

function orNone(value: string): string {
  return value.trim() === '' ? '(없음)' : value
}

/** Prompt with <work>, <wiki> and <history> sections. Skipped turns show "(건너뜀)". */
export function buildInterviewQuestionPrompt(raw: InterviewQuestionInput): string {
  const input = neutralizeDeep(raw)
  const counts = (Object.keys(ENTRY_KIND_LABEL) as EntryKind[])
    .map((kind) => `${ENTRY_KIND_LABEL[kind]} ${input.wiki.counts[kind] ?? 0}`)
    .join(', ')

  const history =
    input.history.length === 0
      ? '(아직 없음)'
      : input.history
          .map((turn, i) => {
            const answer = turn.skipped ? '(건너뜀)' : (turn.answer ?? '(건너뜀)')
            return [
              `[${i + 1}] 주제: ${turn.topic}`,
              `질문: ${turn.question}`,
              `답: ${answer}`,
            ].join('\n')
          })
          .join('\n\n')

  return [
    '<work>',
    `제목: ${input.work.title}`,
    `장르: ${orNone(input.work.genre)}`,
    `한 줄 소개: ${orNone(input.work.logline)}`,
    `시놉시스: ${orNone(input.work.synopsis)}`,
    '</work>',
    '<wiki>',
    `카드 수: ${counts}`,
    `주요 카드: ${input.wiki.entryNames.length > 0 ? input.wiki.entryNames.join(', ') : '(없음)'}`,
    `열린 떡밥: ${input.wiki.openThreadTitles.length > 0 ? input.wiki.openThreadTitles.join(', ') : '(없음)'}`,
    '</wiki>',
    '<history>',
    history,
    '</history>',
    '',
    '위 내용을 보고 다음 질문을 하나 만드세요.',
  ].join('\n')
}

export const interviewQuestionTask: AiTaskDef<InterviewQuestionInput, InterviewQuestion> = {
  name: 'interview-question',
  effort: 'low',
  maxTokens: 2000,
  system: SYSTEM,
  buildPrompt: buildInterviewQuestionPrompt,
  schema: InterviewQuestionSchema,
}
