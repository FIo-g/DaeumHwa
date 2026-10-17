import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { EntryKind } from '@/db/types'
import { stripJosa } from '@/lib/korean'
import { type Extraction, ExtractionSchema } from '@/ai/extraction'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'

// interview-extract (F1): turns one interview answer into wiki candidates. The output is the shared
// Extraction shape; the service maps it to proposals with extractionToProposals.

export type InterviewExtractInput = {
  topic: string
  question: string
  answer: string
  known: { name: string; kind: EntryKind; aliases: string[] }[]
}

const SYSTEM = [
  '당신은 작가의 인터뷰 답변을 설정 위키 후보로 정리한다.',
  '규칙:',
  '- 답변에 담긴 내용만 정리한다. 지어내지 않는다.',
  '- 작가가 단정적으로 말한 것은 suggestedStatus "confirmed", "아마", "~할 수도"처럼 망설이며 말한 것은 "undecided", 답변에서 추론한 것은 "assumed"로 둔다.',
  '- 이미 있는 카드(<known>)는 같은 이름을 쓰고, 새 대상만 entries에 넣는다.',
  '- evidence에는 답변 문장을 그대로 인용한다.',
  '- 앞으로 풀 비밀이나 복선은 threads에 kind "planted"로 넣는다. existingThreadRef와 targetChapterPosition은 답변에 회차가 나오지 않으면 null이다.',
  '- summary는 null, supersedesFactRef는 null로 둔다.',
  TAG_DATA_RULE,
  '- 모든 출력은 한국어로 쓴다.',
].join('\n')

/** Prompt with <question>, <answer> and <known> sections. */
export function buildInterviewExtractPrompt(raw: InterviewExtractInput): string {
  const input = neutralizeDeep(raw)
  const known =
    input.known.length === 0
      ? '(없음)'
      : input.known
          .map((k) => {
            const alias = k.aliases.length > 0 ? `, 별칭: ${k.aliases.join(', ')}` : ''
            return `- ${k.name} (${ENTRY_KIND_LABEL[k.kind]}${alias})`
          })
          .join('\n')
  return [
    '<question>',
    `주제: ${input.topic}`,
    `질문: ${input.question}`,
    '</question>',
    '<answer>',
    input.answer.trim(),
    '</answer>',
    '<known>',
    known,
    '</known>',
  ].join('\n')
}

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
function fakeExtraction(input: InterviewExtractInput): Extraction {
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
  if (input.topic === '떡밥') {
    threads.push({
      title: Array.from(answer).slice(0, 20).join(''),
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

export const interviewExtractTask: AiTaskDef<InterviewExtractInput, Extraction> = {
  name: 'interview-extract',
  effort: 'medium',
  maxTokens: 8000,
  system: SYSTEM,
  buildPrompt: buildInterviewExtractPrompt,
  schema: ExtractionSchema,
  fake: fakeExtraction,
}
