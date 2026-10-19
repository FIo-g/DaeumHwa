// Chapter draft (spec F13): streamed text, not a structured task. The service in
// src/server/ai-features.ts builds the prompt and runs it through startAiStream.

import { neutralizeDeep, neutralizeTags, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { continuationPlan, draftCharCount, draftLengthPlan } from '@/lib/draft-length'
import { renderVoiceLines, type VoiceLine } from '@/ai/voice'

export const DRAFT_SYSTEM = `당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.
규칙:
- 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.
- 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.
- 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.
- 서술은 작품 문체 카드를 따른다.
- 견본은 어조만 참고하고, 문장과 이미지를 베껴 쓰지 않는다.
- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.
- <target_length>의 최소 분량 이상 쓰고 최대 분량은 넘기지 않는다. 분량이 모자라면 사건을 늘리지 말고 장면 묘사와 대사를 더 쓴다. <scene_budget>이 있으면 장면마다 그 분량을 채운다.
- <draft_so_far>가 있으면 그 글 바로 뒤에서 이어 쓴다. 앞부분을 다시 쓰거나 요약하지 않고 이어 쓸 부분만 출력한다. <continue_length>의 분량을 지킨다.
${TAG_DATA_RULE}
- 제목이나 설명 없이 본문만 출력한다.`

export const DRAFT_MAX_TOKENS = 16000
export const DRAFT_EFFORT = 'high' as const
/** The continuation is shorter and reuses the draft's system prompt, so it runs with low effort. */
export const CONTINUE_EFFORT = 'low' as const
export const CONTINUE_MAX_TOKENS = DRAFT_MAX_TOKENS

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
  /** Speech of each main character. Undefined (the speech feature is off) means no <voices> block. */
  voices?: Pick<VoiceLine, 'name' | 'speech'>[]
}

export function buildDraftPrompt(raw: DraftPromptInput): string {
  const input = neutralizeDeep(raw)
  const cards =
    input.styleCards.length > 0 ? input.styleCards.map(renderCard).join('\n\n') : '(없음)'
  const length = draftLengthPlan(input.targetChars)
  return [
    `<chapter>${input.chapterLabel}</chapter>`,
    `<target_length>공백 포함 ${length.minChars}자 이상, ${length.maxChars}자 이하</target_length>`,
    `<scene_budget>장면 ${length.sceneCount}개, 장면마다 공백 포함 ${length.charsPerScene}자 안팎</scene_budget>`,
    '<instructions>',
    input.instructions,
    '</instructions>',
    '',
    ...voicesSection(input.voices),
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

/**
 * Prompt for the one continuation call: the draft prompt, then the text written so far and how
 * much more to write. Only called when the draft is still short of the target.
 */
export function buildContinuationPrompt(raw: DraftPromptInput, draftSoFar: string): string {
  const plan = continuationPlan(draftCharCount(draftSoFar), raw.targetChars)
  // Internal invariant: the caller starts a continuation only when the draft is short.
  if (plan === null) throw new Error('The draft already reaches the target; nothing to continue.')
  return [
    buildDraftPrompt(raw),
    '',
    '<draft_so_far>',
    neutralizeTags(draftSoFar),
    '</draft_so_far>',
    `<continue_length>지금까지 ${plan.count}자를 썼다. 이어서 공백 포함 ${plan.askMin}자 이상, ${plan.askMax}자 이하로 쓴다.</continue_length>`,
  ].join('\n')
}

/** The <voices> block, with its trailing blank line; empty when voices are not given. */
function voicesSection(voices: DraftPromptInput['voices']): string[] {
  if (voices === undefined) return []
  return [
    '<voices>',
    '인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.',
    renderVoiceLines(voices),
    '</voices>',
    '',
  ]
}

function renderCard(card: DraftPromptInput['styleCards'][number]): string {
  const scope = card.entryName ? `인물 ${card.entryName}` : '작품 전체'
  const lines = [`[${scope}] ${card.name}`, `- 말투: ${card.tone || '(없음)'}`]
  lines.push(`- 규칙: ${card.rules || '(없음)'}`)
  if (card.examples) lines.push(`- 예시:\n${card.examples}`)
  return lines.join('\n')
}
