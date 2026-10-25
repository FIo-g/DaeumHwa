// Chapter draft (spec F13): streamed text, not a structured task. The service in
// src/server/ai-features.ts builds the prompt and runs it through startAiStream.

import { neutralizeDeep, neutralizeTags, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { continuationPlan, draftCharCount, draftLengthPlan } from '@/lib/draft-length'
import { renderVoiceLines, type VoiceLine } from '@/ai/voice'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { type DirectiveForPrompt, renderRequestsBlock } from '@/lib/directives'

export const DRAFT_SYSTEM = `당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.
규칙:
- 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.
- <wiki>의 떡밥 중 "지시에 있을 때만 쓴다"로 표시된 것은 작가의 지시(<instructions>)에 나올 때만 쓴다. 지시에 나오지 않으면 그 떡밥의 사건과 정보를 본문에 쓰지 않는다.
- 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.
- 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.
- 서술은 작품 문체 카드를 따른다.
- 견본은 어조만 참고하고, 문장과 이미지를 베껴 쓰지 않는다.
- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.
- <draft_so_far>가 없으면 첫 장면의 앞부분에서 인물의 목표나 갈등을 보인다. 이동이나 날씨 묘사만으로 회차를 열지 않는다. 목표와 갈등은 작가의 지시와 위키에 있는 것만 쓴다.
- 이 작품에서 처음 나오는 인물과 고유 용어(직책, 지명, 물건, 규칙의 이름)는 나오는 장면 안에서 한 번, 행동이나 대사로 누구인지 무엇인지 알 수 있게 드러낸다. 작가의 지시와 위키에 있는 내용만 쓰고 설명문으로 늘어놓지 않는다. <previous_summary>, <previous_tail>, <draft_so_far>에 이미 나온 것은 다시 소개하지 않는다.
- <target_length>의 최소 분량 이상 쓰고 최대 분량은 넘기지 않는다. 분량이 모자라면 사건을 늘리지 말고 장면 묘사와 대사를 더 쓴다. <scene_budget>이 있으면 장면마다 그 분량을 채운다.
- <draft_so_far>가 있으면 그 글 바로 뒤에서 이어 쓴다. 앞부분을 다시 쓰거나 요약하지 않고 이어 쓸 부분만 출력한다. <continue_length>의 분량을 지킨다.
- <author_requests>는 작가가 계속 지켜 달라고 한 요청이다. 모든 장면에서 지키고, 이번 화 지시(<instructions>)와 부딪치면 지시를 따른다.
${TAG_DATA_RULE}
- 제목이나 설명 없이 본문만 출력한다.`

export const DRAFT_MAX_TOKENS = 32000
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
  /** Chosen example passages (stage 4). Empty or undefined adds no <voice_examples> block. */
  voiceExamples?: string[]
  /** Scene beat list from draft-beats, already rendered as text. Empty or null adds no section. */
  beats?: string | null
  /** Scene count of `beats`. With a non-empty `beats` it replaces the plan's scene count in `<scene_budget>`; ignored without beats. */
  beatSceneCount?: number
  /** Scene count of an approved plan card. Used in `<scene_budget>` when there are no beats. */
  sceneCount?: number
  /** Active author requests for this chapter. Undefined or empty adds no <author_requests> block. */
  requests?: DirectiveForPrompt[]
  /** Core (always-tier) wiki entries, already rendered as text. Empty adds no <core_wiki> block. */
  coreText?: string
}

/**
 * Appended to the draft prompt when beats are given: the prose must follow the beat list.
 * Defined here (not in draft-beats.ts) so this file imports nothing from the beat task.
 */
export const BEATS_RULE =
  '위 장면 목록의 장소, 인물, 물건의 위치, 사건 순서를 그대로 지키고 목록에 없는 장소 이동은 쓰지 않는다.'

/**
 * Header of the <voice_examples> block (stage 4). Shared with the English scaffold.
 */
export const VOICE_EXAMPLES_HEADER =
  '작가 예문. 문체와 말투만 참고하고 문장을 그대로 옮기지 않는다.'

/**
 * The <voice_examples> block: the chosen passages joined by a blank line and ---.
 * Empty when no passages are given.
 */
export function voiceExamplesBlock(passages: string[]): string {
  return [
    '<voice_examples>',
    VOICE_EXAMPLES_HEADER,
    passages.join('\n\n---\n\n'),
    '</voice_examples>',
  ].join('\n')
}

/**
 * The cached prefix of every writing prompt, as two blocks sent ahead of `buildDraftPrompt`:
 * A is the author requests, the voices, the style cards and the core entries (parts that are empty
 * are left out); B is the voice examples and the previous summary and tail. The model reads A, then B, then the rest.
 */
export function buildDraftPrefix(raw: DraftPromptInput): string[] {
  const input = neutralizeDeep(raw)
  const cards =
    input.styleCards.length > 0
      ? input.styleCards.map((card) => renderCard(card)).join('\n\n')
      : '(없음)'
  const blockA = [
    renderRequestsBlock(input.requests ?? []),
    voicesBlock(input.voices),
    ['<style_cards>', cards, '</style_cards>'].join('\n'),
    input.coreText ? `<core_wiki>\n${input.coreText}\n</core_wiki>` : '',
  ]
    .filter((part) => part !== '')
    .join('\n\n')
  const previousBlock = [
    '<previous_summary>',
    input.previousSummary ?? '(없음)',
    '</previous_summary>',
    '',
    '<previous_tail>',
    input.previousTail ?? '(없음)',
    '</previous_tail>',
  ].join('\n')
  const voice =
    input.voiceExamples && input.voiceExamples.length > 0
      ? voiceExamplesBlock(input.voiceExamples)
      : ''
  const blockB = voice === '' ? previousBlock : [voice, previousBlock].join('\n\n')
  return [blockA, blockB]
}

/**
 * The per-call rest of the draft prompt: the chapter, the length lines, the instructions, the wiki
 * and the beats. The cached prefix comes from `buildDraftPrefix`.
 */
export function buildDraftPrompt(
  raw: DraftPromptInput,
  options?: { omitTargetLength?: boolean },
): string {
  const input = neutralizeDeep(raw)
  const length = draftLengthPlan(
    input.targetChars,
    input.beats ? input.beatSceneCount : input.sceneCount,
  )
  // The beat-list call reuses this prompt without the length lines: it only lists scenes.
  const lengthLines = options?.omitTargetLength
    ? []
    : [
        `<target_length>공백 포함 ${length.minChars}자 이상, ${length.maxChars}자 이하</target_length>`,
        `<scene_budget>장면 ${length.sceneCount}개, 장면마다 공백 포함 ${length.charsPerScene}자 안팎</scene_budget>`,
      ]
  return [
    `<chapter>${input.chapterLabel}</chapter>`,
    ...lengthLines,
    '<instructions>',
    input.instructions,
    '</instructions>',
    '',
    '<wiki>',
    input.packText,
    '</wiki>',
    ...beatsSection(input.beats),
  ].join('\n')
}

/**
 * Prompt for one scene call in `scenes` mode: the draft prompt, then the text written so far and
 * the scene's length line. `soFar` is the chapter text before this scene (empty for the first one).
 */
export function buildScenePrompt(
  raw: DraftPromptInput,
  card: DraftPlanCard,
  index: number,
  soFar: string,
): string {
  const scene = card.scenes[index]
  const count = draftCharCount(soFar)
  const remaining = Math.max(0, raw.targetChars - count)
  const last = index === card.scenes.length - 1
  const line = `장면 ${index + 1}만 쓰고 멈춘다. 이 장면은 공백 포함 약 ${scene.targetChars}자. 지금까지 ${count}자를 썼고 회차 목표까지 ${remaining}자 남았다.${last ? ' 이 장면이 마지막 장면이다.' : ''}`
  return [
    buildDraftPrompt(raw),
    '',
    '<draft_so_far>',
    soFar === '' ? '(없음)' : neutralizeTags(soFar),
    '</draft_so_far>',
    `<scene_now>${line}</scene_now>`,
  ].join('\n')
}

/** The <beats> block, led by a blank line; empty when no beats are given. */
function beatsSection(beats: DraftPromptInput['beats']): string[] {
  if (!beats) return []
  return ['', '<beats>', BEATS_RULE, beats, '</beats>']
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

/** The <voices> block; empty when voices are not given (the speech feature is off). */
function voicesBlock(voices: DraftPromptInput['voices']): string {
  if (voices === undefined) return ''
  return [
    '<voices>',
    '인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.',
    renderVoiceLines(voices),
    '</voices>',
  ].join('\n')
}

export function renderCard(
  card: DraftPromptInput['styleCards'][number],
  examplesOverride?: unknown,
): string {
  const scope = card.entryName ? `인물 ${card.entryName}` : '작품 전체'
  const lines = [`[${scope}] ${card.name}`, `- 말투: ${card.tone || '(없음)'}`]
  lines.push(`- 규칙: ${card.rules || '(없음)'}`)
  const examples = typeof examplesOverride === 'string' ? examplesOverride : card.examples
  if (examples) lines.push(`- 예시:\n${examples}`)
  return lines.join('\n')
}
