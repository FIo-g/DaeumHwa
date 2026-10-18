import { z } from 'zod'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { type EntryKind, INTERVIEW_FOCUSES, type InterviewFocus } from '@/db/types'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'

// interview-question (F1): picks the next interview question from the wiki, the story so far and
// every earlier question of the work. Output is one question; the service stores it as a turn.

export type InterviewQuestionInput = {
  work: { title: string; genre: string; logline: string; synopsis: string }
  wiki: {
    counts: Record<EntryKind, number>
    entries: { name: string; kind: EntryKind; factCount: number; summary: string }[]
    openThreads: { title: string; targetChapterPosition: number | null }[]
  }
  story: {
    latestPosition: number | null
    recentSummaries: { position: number; title: string; summary: string }[]
    readerReactions: { position: number; digest: string }[]
    openIssueCount: number
  }
  /** Every earlier question of the work, oldest first (the newest 120 at most). */
  covered: {
    topic: string
    question: string
    answer: string | null
    skipped: boolean
    focus: InterviewFocus
  }[]
  /** How many older questions were left out of `covered`. */
  coveredDropped: number
  /** The last answered or skipped turns of this session. */
  recent: { topic: string; question: string; answer: string | null; skipped: boolean }[]
  /** A question the service found to repeat an earlier one; the new question must differ. */
  rejected: string | null
}

export type InterviewQuestion = {
  focus: InterviewFocus
  topic: string
  question: string
  rationale: string
}

const InterviewQuestionSchema = z.object({
  focus: z.enum(INTERVIEW_FOCUSES),
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
  '당신은 웹소설 작가의 기획을 돕는 인터뷰어다. 작가의 설정 위키를 채우고 연재를 이어 가기 위해 질문을 한 번에 하나만 한다.',
  '규칙:',
  `- 핵심 설정은 ${INTERVIEW_TOPICS.join(', ')}이다. <wiki>와 <covered>를 보고 비었거나 얕은 것이 있으면 focus를 "setting"으로 하고 그 주제를 묻는다.`,
  '- 핵심 설정이 충분하면 focus를 "story"로 하고 다음 화를 어떻게 할지, 스토리라인을 어떻게 끌고 갈지 묻는다. <story>에 최신 회차가 (없음)이면 "story"를 고르지 않는다.',
  '- story 질문은 회차 번호, 떡밥 이름, 독자 반응 같은 구체적인 재료를 짚는다.',
  '- <covered>에 있는 질문은 되풀이하지 않는다. 같은 주제를 다시 물을 때는 이전 답을 바탕으로 한 걸음 더 나아간 질문만 한다.',
  '- <rejected>에 적힌 질문과 같은 질문은 하지 않는다.',
  '- 질문은 구체적이고 답하기 쉽게 한두 문장으로 쓴다. 예시 답을 늘어놓지 않는다.',
  '- topic에는 주제 이름을, rationale에는 이 질문이 위키나 연재의 어느 부분을 채우는지 한 문장으로 쓴다.',
  TAG_DATA_RULE,
  '- 모든 출력은 한국어로 쓴다.',
].join('\n')

function orNone(value: string): string {
  return value.trim() === '' ? '(없음)' : value
}

/** One line of text: whitespace runs become single spaces, and the text is cut at `max` characters. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat
}

function covered(input: InterviewQuestionInput): string {
  const lines = input.covered.map((turn) => {
    const answer = turn.skipped ? '(건너뜀)' : oneLine(turn.answer ?? '(건너뜀)', 80)
    return `- [${turn.focus}] ${turn.topic} | 질문: ${oneLine(turn.question, 120)} | 답: ${answer}`
  })
  if (input.coveredDropped > 0) lines.unshift(`생략한 이전 질문: ${input.coveredDropped}개`)
  return lines.length > 0 ? lines.join('\n') : '(없음)'
}

/**
 * Prompt with <work>, <wiki>, <story>, <covered>, <recent> and, after a repeat, <rejected>
 * sections. Skipped turns show "(건너뜀)".
 */
export function buildInterviewQuestionPrompt(raw: InterviewQuestionInput): string {
  const input = neutralizeDeep(raw)
  const counts = (Object.keys(ENTRY_KIND_LABEL) as EntryKind[])
    .map((kind) => `${ENTRY_KIND_LABEL[kind]} ${input.wiki.counts[kind] ?? 0}`)
    .join(', ')
  const cards =
    input.wiki.entries.length > 0
      ? input.wiki.entries
          .map(
            (e) =>
              `- ${e.name} (${ENTRY_KIND_LABEL[e.kind]}, 사실 ${e.factCount}개): ${oneLine(e.summary, 40) || '(요약 없음)'}`,
          )
          .join('\n')
      : '(없음)'
  const threads =
    input.wiki.openThreads.length > 0
      ? input.wiki.openThreads
          .map((t) =>
            t.targetChapterPosition === null
              ? t.title
              : `${t.title} (회수 목표 ${t.targetChapterPosition}화)`,
          )
          .join(', ')
      : '(없음)'

  const latest = input.story.latestPosition === null ? '(없음)' : `${input.story.latestPosition}화`
  const summaries =
    input.story.recentSummaries.length > 0
      ? input.story.recentSummaries
          .map((s) => `- ${s.position}화 ${s.title}: ${oneLine(s.summary, 300)}`)
          .join('\n')
      : '(없음)'
  const reactions =
    input.story.readerReactions.length > 0
      ? input.story.readerReactions.map((r) => `- ${r.position}화: ${r.digest}`).join('\n')
      : '(없음)'

  const recent =
    input.recent.length > 0
      ? input.recent
          .map((turn) => {
            const answer = turn.skipped ? '(건너뜀)' : oneLine(turn.answer ?? '(건너뜀)', 600)
            return `- ${turn.topic} | 질문: ${oneLine(turn.question, 200)} | 답: ${answer}`
          })
          .join('\n')
      : '(없음)'

  const sections = [
    '<work>',
    `제목: ${input.work.title}`,
    `장르: ${orNone(input.work.genre)}`,
    `한 줄 소개: ${orNone(input.work.logline)}`,
    `시놉시스: ${orNone(input.work.synopsis)}`,
    '</work>',
    '<wiki>',
    `카드 수: ${counts}`,
    '카드:',
    cards,
    `열린 떡밥: ${threads}`,
    '</wiki>',
    '<story>',
    `최신 회차: ${latest}`,
    '최근 회차 요약:',
    summaries,
    '최근 독자 반응:',
    reactions,
    `열린 회차 점검 지적: ${input.story.openIssueCount}건`,
    '</story>',
    '<covered>',
    covered(input),
    '</covered>',
    '<recent>',
    recent,
    '</recent>',
  ]
  if (input.rejected !== null)
    sections.push('<rejected>', oneLine(input.rejected, 200), '</rejected>')
  sections.push('', '위 내용을 보고 다음 질문을 하나 만드세요.')
  return sections.join('\n')
}

export const interviewQuestionTask: AiTaskDef<InterviewQuestionInput, InterviewQuestion> = {
  name: 'interview-question',
  effort: 'low',
  maxTokens: 2000,
  system: SYSTEM,
  buildPrompt: buildInterviewQuestionPrompt,
  schema: InterviewQuestionSchema,
}
