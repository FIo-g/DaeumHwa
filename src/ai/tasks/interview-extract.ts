import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { EntryKind, InterviewFocus } from '@/db/types'
import { type Extraction, ExtractionSchema } from '@/ai/extraction'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { ENTITY_NAME_RULES } from '@/ai/extraction-rules'
import type { AiTaskDef } from '@/ai/types'
import { isSpeechStyleEnabled } from '@/ai/voice'

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
  /** Current facts of the work and pending fact_create texts (pending: true), so they are not extracted again. */
  knownFacts: { subjectName: string; content: string; pending: boolean }[]
}

const SYSTEM_LINES = [
  '당신은 작가의 인터뷰 답변을 설정 위키 후보로 정리한다.',
  '규칙:',
  '- 답변에 담긴 내용만 정리한다. 지어내지 않는다.',
  '- 작가가 단정적으로 말한 것은 suggestedStatus "confirmed", "아마", "~할 수도"처럼 망설이며 말한 것은 "undecided", 답변에서 추론한 것은 "assumed"로 둔다.',
  '- 이미 있는 카드(<known>)는 같은 이름을 쓰고, 새 대상만 entries에 넣는다.',
  '- <known_facts>에 이미 있는 사실은 facts에 다시 넣지 않는다. 표현만 바꾼 같은 내용도 넣지 않는다. 새로 알게 된 내용만 넣는다.',
  '- evidence에는 답변 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장).',
  '- 앞으로 풀 비밀이나 복선은 threads에 kind "planted"로 넣는다. existingThreadRef는 항상 null로 둔다. targetChapterPosition은 답변에 회차가 나오지 않으면 null이다.',
  '- <threads>에 이미 있는 떡밥은 threads에 다시 넣지 않는다.',
  '- focus가 "story"인 답에서는 작가가 정한 앞으로의 전개를 threads에 kind "planted"로 넣는다. 답에 회차가 나오면 targetChapterPosition에 그 회차 번호를 쓴다.',
  '- focus가 "story"인 답에서 작가가 망설이며 말한 아이디어는 threads가 아니라 facts에 suggestedStatus "undecided"로 넣고, subjectName은 관련 인물 카드 이름으로 한다.',
  '- <threads>에 이미 있는 떡밥이 바뀌는 내용(회수 목표 회차 변경 등)은 threads에 넣지 않는다. 그 내용이 어떤 인물 카드의 사실이면 subjectName을 그 인물 카드 이름으로 facts에 넣고, 아니면 버린다.',
  '- summary는 null, supersedesFactRef는 null로 둔다.',
  ENTITY_NAME_RULES,
  TAG_DATA_RULE,
  '- 모든 출력은 한국어로 쓴다.',
]

/** Speech rules (spec 8, track B), added only when the feature is on. */
const SPEECH_EXTRACT_APPEND =
  ' 단, 답에 인물의 말투(존댓말·반말·말버릇)가 나오면 이미 있는 카드여도 그 인물을 entries에 넣고 fields에 key "speech"로 말투를 한 문장으로 쓴다.'
const SPEECH_EXTRACT_RULE =
  '- 인물 카드의 말투는 항상 fields의 key "speech"에 쓴다. 다른 key(말투, 화법, voice)를 쓰지 않는다.'

/** The interview extraction system prompt. `speech` appends the speech rules at their anchors. */
export function buildInterviewExtractSystem(speech: boolean): string {
  if (!speech) return SYSTEM_LINES.join('\n')
  const lines = [...SYSTEM_LINES]
  const known = lines.findIndex((line) => line.startsWith('- 이미 있는 카드(<known>)'))
  if (known === -1)
    throw new Error('interview-extract SYSTEM has no "- 이미 있는 카드(<known>)" line')
  lines[known] += SPEECH_EXTRACT_APPEND
  const names = lines.indexOf(ENTITY_NAME_RULES)
  if (names === -1) throw new Error('interview-extract SYSTEM has no ENTITY_NAME_RULES line')
  lines.splice(names, 0, SPEECH_EXTRACT_RULE)
  return lines.join('\n')
}

/** Prompt with <question>, <answer>, <known>, <known_facts> and <threads> sections. */
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
  const knownFacts =
    input.knownFacts.length === 0
      ? '(없음)'
      : input.knownFacts
          .map((f) => `- ${f.subjectName}: ${f.content}${f.pending ? ' (승인 대기)' : ''}`)
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
    '<known_facts>',
    knownFacts,
    '</known_facts>',
    '<threads>',
    threads,
    '</threads>',
  ].join('\n')
}

export const interviewExtractTask: AiTaskDef<InterviewExtractInput, Extraction> = {
  name: 'interview-extract',
  effort: 'medium',
  maxTokens: 8000,
  // A getter: the speech flag is read at call time, never frozen at module load.
  get system() {
    return buildInterviewExtractSystem(isSpeechStyleEnabled())
  },
  buildPrompt: buildInterviewExtractPrompt,
  schema: ExtractionSchema,
}
