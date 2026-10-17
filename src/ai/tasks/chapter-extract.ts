import { ExtractionSchema, type Extraction } from '@/ai/extraction'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import type { EntryKind, ThreadStatus } from '@/db/types'
import { findMentions } from '@/lib/korean/mentions'
import { splitSentences } from '@/lib/korean/sentences'
import { ENTRY_KIND_LABEL } from '@/lib/labels'

// Chapter extraction (F7 "새 사실 후보", F6 import): turns one manuscript chapter into wiki
// candidates. The output goes through extractionToProposals; nothing here writes wiki rows.

export type ChapterExtractInput = {
  chapterText: string
  chapterPosition: number
  chapterTitle: string
  known: { name: string; kind: EntryKind; aliases: string[] }[]
  openThreads: { ref: string; title: string; description: string; status?: ThreadStatus }[]
  knownFacts: { ref: string; subjectName: string; content: string }[]
  model?: string
}

export const CHAPTER_EXTRACT_SYSTEM = `당신은 장기 연재 웹소설의 설정 기록 담당자다. 주어진 회차 원고에서 설정 위키에 남길 후보를 뽑는다.
규칙:
- 원고에 실제로 쓰인 내용만 뽑는다. 원고에 없는 내용을 지어내지 않는다.
- evidence에는 원고 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장, 120자 이내).
- 원고에 직접 쓰인 사실은 suggestedStatus "confirmed", 원고에서 추론한 것은 "assumed"로 둔다.
- 이미 알려진 대상(<known>)은 같은 이름을 쓰고, entries에는 목록에 없는 새 인물·장소·조직·물건·규칙·사건·용어만 넣는다.
- facts에는 나중에 설정 충돌을 찾는 데 쓸 구체적인 정보(외모, 능력, 나이, 관계, 소속, 과거사, 세계의 규칙, 약속)를 우선한다. 사소한 행동 묘사는 넣지 않는다.
- 이 회차에서 상태가 바뀐 사실(<known_facts>의 F ref와 다른 새 상태)은 supersedesFactRef에 그 ref를 넣는다.
- threads는 독자에게 의문이나 기대를 남기고 아직 풀리지 않은 요소다. <open_threads>의 떡밥이 이 회차에서 진전되거나 풀리면 kind를 "developed" 또는 "resolved"로 하고 existingThreadRef에 그 T ref를 넣는다. 새로 심어진 떡밥은 kind "planted", existingThreadRef null.
- <open_threads>에서 "(계획됨)"으로 표시된 떡밥이 이 회차에서 처음 심어지면 kind "planted"로 하고 existingThreadRef에 그 T ref를 넣는다. 이미 심어진 떡밥을 다시 "planted"로 내지 않는다.
- relations는 인물·장소·조직 사이의 관계(가족, 연인, 적대, 동료, 소속, 스승 등)가 드러날 때만 넣는다.
- summary는 이 회차의 핵심 사건을 3문장 이내로 요약한다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

const SUMMARY_MAX_CHARS = 80
const EVIDENCE_MAX_CHARS = 120
const MAX_FAKE_NEW_ENTRIES = 5
const MIN_FAKE_NAME_COUNT = 3
/** Hangul word of 2 to 4 syllables directly followed by a subject particle. */
const SUBJECT_WORD = /[가-힣]{2,4}(?=[은는이가])/g

function buildPrompt(raw: ChapterExtractInput): string {
  const input = neutralizeDeep(raw)
  const known =
    input.known.length === 0
      ? '(없음)'
      : input.known
          .map((k) => {
            const aliases = k.aliases.length > 0 ? `, 별칭: ${k.aliases.join(', ')}` : ''
            return `- ${k.name} (${ENTRY_KIND_LABEL[k.kind]}${aliases})`
          })
          .join('\n')
  const knownFacts =
    input.knownFacts.length === 0
      ? '(없음)'
      : input.knownFacts.map((f) => `[${f.ref}] ${f.subjectName}: ${f.content}`).join('\n')
  const openThreads =
    input.openThreads.length === 0
      ? '(없음)'
      : input.openThreads
          .map((t) => {
            const planned = t.status === 'planned' ? ' (계획됨)' : ''
            return `[${t.ref}]${planned} ${t.title}${t.description ? `: ${t.description}` : ''}`
          })
          .join('\n')
  return [
    '<known>',
    known,
    '</known>',
    '',
    '<known_facts>',
    knownFacts,
    '</known_facts>',
    '',
    '<open_threads>',
    openThreads,
    '</open_threads>',
    '',
    `<manuscript position="${input.chapterPosition}" title="${input.chapterTitle.replace(/"/g, "'")}">`,
    input.chapterText,
    '</manuscript>',
  ].join('\n')
}

/** Deterministic stand-in: frequent subject words become characters, and every named entry gets one appearance fact. */
function fakeExtraction(input: ChapterExtractInput): Extraction {
  const sentences = splitSentences(input.chapterText)
  const summary = (sentences[0]?.text ?? '').slice(0, SUMMARY_MAX_CHARS)

  const knownNames = new Set(input.known.flatMap((k) => [k.name, ...k.aliases]))
  const newNames = candidateNames(input.chapterText)
    .filter((name) => !knownNames.has(name))
    .slice(0, MAX_FAKE_NEW_ENTRIES)

  const targets = [
    ...input.known.map((k) => ({ id: k.name, names: [k.name, ...k.aliases] })),
    ...newNames.map((name) => ({ id: name, names: [name] })),
  ]
  const namesById = new Map(targets.map((t) => [t.id, t.names]))
  const facts = findMentions(input.chapterText, targets).map((mention) => {
    const names = namesById.get(mention.entryId) ?? []
    const sentence = sentences.find((s) => names.some((n) => s.text.includes(n)))
    return {
      subjectName: mention.entryId,
      content: `${input.chapterPosition}화에 등장한다.`,
      evidence: (sentence?.text ?? '').slice(0, EVIDENCE_MAX_CHARS),
      suggestedStatus: 'confirmed' as const,
      supersedesFactRef: null,
    }
  })

  return {
    summary,
    entries: newNames.map((name) => ({
      name,
      kind: 'character' as const,
      aliases: [],
      summary: '',
      fields: [],
    })),
    facts,
    threads: [],
    relations: [],
  }
}

function candidateNames(text: string): string[] {
  const counts = new Map<string, number>()
  for (const match of text.matchAll(SUBJECT_WORD)) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1)
  }
  return [...counts].filter(([, count]) => count >= MIN_FAKE_NAME_COUNT).map(([word]) => word)
}

export const chapterExtractTask: AiTaskDef<ChapterExtractInput, Extraction> = {
  name: 'chapter-extract',
  effort: 'medium',
  maxTokens: 16000,
  system: CHAPTER_EXTRACT_SYSTEM,
  buildPrompt,
  schema: ExtractionSchema,
  fake: fakeExtraction,
}
