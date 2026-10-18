import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { EntryKind, InterviewFocus } from '@/db/types'
import { type Extraction, ExtractionSchema } from '@/ai/extraction'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { ENTITY_NAME_RULES } from '@/ai/extraction-rules'
import type { AiTaskDef } from '@/ai/types'

// interview-extract (F1): turns one interview answer into wiki candidates. The output is the shared
// Extraction shape; the service maps it to proposals with extractionToProposals.

export type InterviewExtractInput = {
  topic: string
  /** The focus the question was asked with ("setting" or "story"). */
  focus: InterviewFocus
  question: string
  answer: string
  /** Wiki cards, plus pending entry cards (pending: true) that are still waiting for approval. */
  known: { name: string; kind: EntryKind; aliases: string[]; pending: boolean }[]
  /** Existing threads, plus pending thread_create titles (pending: true). */
  threads: { title: string; pending: boolean }[]
}

const SYSTEM = [
  '당신은 작가의 인터뷰 답변을 설정 위키 후보로 정리한다.',
  '규칙:',
  '- 답변에 담긴 내용만 정리한다. 지어내지 않는다.',
  '- 작가가 단정적으로 말한 것은 suggestedStatus "confirmed", "아마", "~할 수도"처럼 망설이며 말한 것은 "undecided", 답변에서 추론한 것은 "assumed"로 둔다.',
  '- 이미 있는 카드(<known>)는 같은 이름을 쓰고, 새 대상만 entries에 넣는다.',
  '- evidence에는 답변 문장을 그대로 인용한다.',
  '- 앞으로 풀 비밀이나 복선은 threads에 kind "planted"로 넣는다. existingThreadRef와 targetChapterPosition은 답변에 회차가 나오지 않으면 null이다.',
  '- 떡밥이 <threads>에 있는 제목과 같은 떡밥이면 그 제목을 그대로 쓴다.',
  '- focus가 "story"인 답에서는 작가가 정한 앞으로의 전개를 threads에 kind "planted"로 넣는다. 답에 회차가 나오면 targetChapterPosition에 그 회차 번호를 쓴다.',
  '- focus가 "story"인 답에서 작가가 망설이며 말한 아이디어는 threads가 아니라 facts에 suggestedStatus "undecided"로 넣고, subjectName은 관련 인물 카드 이름으로 한다.',
  '- 이미 있는 떡밥의 회수 목표 회차를 바꾸는 내용은 threads에 넣지 않고 facts로 남긴다.',
  '- summary는 null, supersedesFactRef는 null로 둔다.',
  ENTITY_NAME_RULES,
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
            const pending = k.pending ? ', 승인 대기' : ''
            return `- ${k.name} (${ENTRY_KIND_LABEL[k.kind]}${alias}${pending})`
          })
          .join('\n')
  const threads =
    input.threads.length === 0
      ? '(없음)'
      : input.threads.map((t) => `- ${t.title}${t.pending ? ' (승인 대기)' : ''}`).join('\n')
  return [
    '<question>',
    `주제: ${input.topic}`,
    `초점: ${input.focus}`,
    `질문: ${input.question}`,
    '</question>',
    '<answer>',
    input.answer.trim(),
    '</answer>',
    '<known>',
    known,
    '</known>',
    '<threads>',
    threads,
    '</threads>',
  ].join('\n')
}

export const interviewExtractTask: AiTaskDef<InterviewExtractInput, Extraction> = {
  name: 'interview-extract',
  effort: 'medium',
  maxTokens: 8000,
  system: SYSTEM,
  buildPrompt: buildInterviewExtractPrompt,
  schema: ExtractionSchema,
}
