// Chapter draft (spec F13): streamed text, not a structured task. The service in
// src/server/ai-features.ts builds the prompt and runs it through startAiStream.

import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'

export const DRAFT_SYSTEM = `당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.
규칙:
- 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.
- 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.
- 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.
- 서술은 작품 문체 카드를 따른다.
- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.
- 목표 분량에 가깝게 쓴다.
${TAG_DATA_RULE}
- 제목이나 설명 없이 본문만 출력한다.`

export const DRAFT_MAX_TOKENS = 16000
export const DRAFT_EFFORT = 'high' as const

export type DraftPromptInput = {
  instructions: string
  targetChars: number
  styleCards: {
    name: string
    entryName: string | null
    tone: string
    rules: string
    examples: string
  }[]
  packText: string
  previousSummary: string | null
  previousTail: string | null
  chapterLabel: string
}

export function buildDraftPrompt(raw: DraftPromptInput): string {
  const input = neutralizeDeep(raw)
  const cards =
    input.styleCards.length > 0 ? input.styleCards.map(renderCard).join('\n\n') : '(없음)'
  return [
    `<chapter>${input.chapterLabel}</chapter>`,
    `<target_length>약 ${input.targetChars}자</target_length>`,
    '<instructions>',
    input.instructions,
    '</instructions>',
    '',
    '<style_cards>',
    cards,
    '</style_cards>',
    '',
    '<wiki>',
    input.packText,
    '</wiki>',
    '',
    '<previous_summary>',
    input.previousSummary ?? '(없음)',
    '</previous_summary>',
    '',
    '<previous_tail>',
    input.previousTail ?? '(없음)',
    '</previous_tail>',
  ].join('\n')
}

function renderCard(card: DraftPromptInput['styleCards'][number]): string {
  const scope = card.entryName ? `인물 ${card.entryName}` : '작품 전체'
  const lines = [`[${scope}] ${card.name}`, `- 말투: ${card.tone || '(없음)'}`]
  lines.push(`- 규칙: ${card.rules || '(없음)'}`)
  if (card.examples) lines.push(`- 예시:\n${card.examples}`)
  return lines.join('\n')
}

const FILLER = [
  '그는 잠시 말을 고르다가 천천히 고개를 들었다. 창문 너머로 오후의 빛이 길게 번지고 있었다.',
  '그녀의 목소리는 낮았지만 흔들리지 않았다. 방 안의 공기가 한순간 무겁게 가라앉았다.',
  '아무도 먼저 입을 열지 않았다. 시계 초침 소리만 규칙적으로 이어졌다.',
  '결국 가장 먼저 움직인 쪽은 문가에 서 있던 사람이었다. 그는 짧게 숨을 고르고 발걸음을 옮겼다.',
]

/**
 * Demo output for FakeAiClient: the instructions split into six paragraphs, each padded
 * with fixed filler sentences so the text is always at least 600 characters.
 */
export function fakeDraft(input: { instructions: string }): string {
  const parts = input.instructions
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const paragraphs: string[] = []
  for (let i = 0; i < 6; i++) {
    const own = parts.filter((_, j) => j % 6 === i)
    const lead = own.length > 0 ? `${own.join('. ')}.` : `장면 ${i + 1}의 흐름을 이어 갑니다.`
    paragraphs.push(`${lead} ${FILLER[i % FILLER.length]} ${FILLER[(i + 1) % FILLER.length]}`)
  }
  return `(데모 초안) ${paragraphs.join('\n\n')}`
}
