import { z } from 'zod'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { EntryKind } from '@/db/types'
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

/** Topics in the order the fake client walks through them. */
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

const FREE_TOPIC = '자유'

const FAKE_QUESTIONS: Record<(typeof INTERVIEW_TOPICS)[number], InterviewQuestion> = {
  주인공: {
    topic: '주인공',
    question: '주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?',
    rationale: '주인공 카드와 시작 동기를 채웁니다.',
  },
  '주요 인물': {
    topic: '주요 인물',
    question:
      '주인공 곁에서 이야기를 움직이는 중요한 인물은 누구인가요? 주인공과의 관계도 알려 주세요.',
    rationale: '주요 인물 카드와 인물 관계를 채웁니다.',
  },
  '세계관 규칙': {
    topic: '세계관 규칙',
    question: '이 세계에서 절대 어기면 안 되는 규칙이나 능력의 한계는 무엇인가요?',
    rationale: '세계관 규칙 카드를 채웁니다.',
  },
  '주요 장소': {
    topic: '주요 장소',
    question: '이야기의 중심이 되는 장소는 어디이고, 그곳은 어떤 곳인가요?',
    rationale: '장소 카드를 채웁니다.',
  },
  '중심 갈등': {
    topic: '중심 갈등',
    question: '주인공이 넘어야 할 가장 큰 갈등이나 장애물은 무엇인가요?',
    rationale: '주인공의 목표와 갈등 사실을 채웁니다.',
  },
  떡밥: {
    topic: '떡밥',
    question: '독자에게 아직 밝히지 않은 비밀이나 나중에 회수할 복선이 있나요?',
    rationale: '앞으로 풀 떡밥 목록을 채웁니다.',
  },
  '결말 방향': {
    topic: '결말 방향',
    question: '이야기가 끝날 때 주인공은 어떤 모습이 되어 있기를 바라나요?',
    rationale: '결말 방향 사실을 채웁니다.',
  },
  문체: {
    topic: '문체',
    question: '문장 톤이나 서술 방식에서 꼭 지키고 싶은 원칙이 있나요?',
    rationale: '문체 카드의 기초를 채웁니다.',
  },
}

const SYSTEM = [
  '당신은 웹소설 작가의 기획을 돕는 인터뷰어다. 작가의 설정 위키를 채우기 위해 질문을 한 번에 하나만 한다.',
  '규칙:',
  '- 이미 묻거나 건너뛴 주제는 반복하지 않는다.',
  '- 위키에서 비어 있는 부분(주인공, 주요 인물, 세계관 규칙, 장소, 갈등, 떡밥, 결말 방향, 문체)을 우선한다.',
  '- 질문은 구체적이고 답하기 쉽게 한두 문장으로 쓴다. 예시 답을 늘어놓지 않는다.',
  '- topic에는 주제 이름을, rationale에는 이 질문이 위키의 어느 부분을 채우는지 한 문장으로 쓴다.',
  '- 모든 출력은 한국어로 쓴다.',
].join('\n')

function orNone(value: string): string {
  return value.trim() === '' ? '(없음)' : value
}

/** Prompt with <work>, <wiki> and <history> sections. Skipped turns show "(건너뜀)". */
export function buildInterviewQuestionPrompt(input: InterviewQuestionInput): string {
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

/** Picks the first topic that has not been asked, then the free topic. */
function fakeQuestion(input: InterviewQuestionInput): InterviewQuestion {
  const asked = new Set(input.history.map((turn) => turn.topic))
  const next = INTERVIEW_TOPICS.find((topic) => !asked.has(topic))
  if (next) return { ...FAKE_QUESTIONS[next] }
  return {
    topic: FREE_TOPIC,
    question: '더 정리해 두고 싶은 설정이 있나요?',
    rationale: '아직 묻지 않은 설정을 정리합니다.',
  }
}

export const interviewQuestionTask: AiTaskDef<InterviewQuestionInput, InterviewQuestion> = {
  name: 'interview-question',
  effort: 'low',
  maxTokens: 2000,
  system: SYSTEM,
  buildPrompt: buildInterviewQuestionPrompt,
  schema: InterviewQuestionSchema,
  fake: fakeQuestion,
}
