// Scene beat list (local eval only, spec 7): before a two-step draft, the instructed events are
// split into scenes. The prose call then gets the rendered list as <beats>. The service in
// src/server/ai-features.ts runs it only when startDraft is given twoStep. The scene count comes
// from draftLengthPlan, the same source the prose <scene_budget> uses.

import { z } from 'zod'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { buildDraftPrompt, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { draftLengthPlan } from '@/lib/draft-length'
import type { AiTaskDef } from '@/ai/types'

export { BEATS_RULE } from '@/ai/tasks/draft-chapter'

export type DraftBeats = {
  scenes: {
    place: string
    characters: string[]
    objects: string[]
    sequence: string[]
    /** Decision state: what the character has decided by the end of the scene, or not yet. One sentence. */
    decision?: string
    /** What the character expected in the scene and what was lost or not gained. One sentence. */
    stake?: string
  }[]
}

export const DraftBeatsSchema: z.ZodType<DraftBeats> = z.object({
  // At least one scene: an empty list is a model failure, so the call fails and is recorded as one.
  scenes: z
    .array(
      z.object({
        place: z.string(),
        characters: z.array(z.string()),
        objects: z.array(z.string()),
        sequence: z.array(z.string()),
        // Optional on purpose: a beat list without them (older runs, the test fake) stays valid and renders as before.
        decision: z.string().optional(),
        stake: z.string().optional(),
      }),
    )
    .min(1),
})

// Prose rule for the state lines. It lives here, not in draft-chapter.ts, because renderBeats emits it
// only when a scene has a decision or a stake.
export const BEATS_STATE_RULE =
  '장면에 "결정 상태"가 있으면 인물이 정한 것을 뒤의 문장에서 이유 없이 뒤집지 않는다. "기대한 것과 잃은 것"은 감정 이름을 쓰지 말고 인물의 몸짓이나 손에 든 사물로 보인다.'

export const DRAFT_BEATS_SYSTEM = `당신은 웹소설 초안의 장면 구성을 돕는 보조 작가다. 작가의 지시에 있는 사건을 장면 목록으로 나눈다.
규칙:
- 작가의 지시(<instructions>)에 있는 사건을 <scene_count>에 적힌 개수의 장면으로 나누고, 이야기 순서대로 놓는다. 장면 수를 늘리거나 줄이지 않는다.
- 사건이 장면 수보다 적으면 긴 사건을 앞부분과 뒷부분으로 나누되 장소는 바꾸지 않는다. 사건이 장면 수보다 많으면 이어지는 사건을 한 장면으로 묶는다.
- 장면마다 장소, 그 자리에 있는 인물, 물건과 그 물건이 있는 곳(또는 들고 있는 인물), 사건 순서를 쓴다.
- 사건 순서는 일어난 순서대로 짧은 문장 하나씩 쓴다.
- 장면마다 결정 상태(decision)를 한 문장으로 쓴다. 그 장면이 끝날 때 인물이 정한 것, 또는 아직 정하지 못한 것이다. 앞 장면에서 정한 것을 뒤 장면에서 이유 없이 바꾸지 않는다.
- 장면마다 기대한 것과 잃은 것(stake)을 한 문장으로 쓴다. 인물이 그 장면에서 바란 것과 얻지 못하거나 잃은 것이다. 위키에 그 인물의 감정이나 태도가 적혀 있으면 반영한다.
- 지시와 위키에서 알 수 없으면 decision과 stake는 빈 문자열("")로 둔다. 지어내지 않는다.
- 설정 위키(<wiki>)와 작가의 지시에 있는 내용만 쓴다. 지시에 없는 사건을 지어내지 않는다.
- 인물과 장소의 이름은 위키에 적힌 그대로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/**
 * Renders the beat list as plain text for the <beats> section. Scenes are separated by one blank
 * line. An empty list, people, objects or sequence is written as (없음), so no line is dropped.
 * The two state lines (decision, stake) are the only lines skipped when empty, not written as
 * (없음). When at least one scene has a state line, BEATS_STATE_RULE goes above the list. A list
 * without state lines renders exactly as before and gets no rule.
 */
export function renderBeats(beats: DraftBeats): string {
  if (beats.scenes.length === 0) return '(없음)'
  const text = beats.scenes.map(renderScene).join('\n\n')
  const hasState = beats.scenes.some((scene) => stateLines(scene).length > 0)
  return hasState ? `${BEATS_STATE_RULE}\n\n${text}` : text
}

function renderScene(scene: DraftBeats['scenes'][number], index: number): string {
  const people = scene.characters.length > 0 ? scene.characters.join(', ') : '(없음)'
  const objects = scene.objects.length > 0 ? scene.objects.join('; ') : '(없음)'
  const sequence =
    scene.sequence.length > 0 ? scene.sequence.map((step, i) => `${i + 1}. ${step}`) : ['(없음)']
  return [
    `장면 ${index + 1}`,
    `장소: ${scene.place}`,
    `인물: ${people}`,
    `물건: ${objects}`,
    ...stateLines(scene),
    '순서:',
    ...sequence,
  ].join('\n')
}

function stateLines(scene: DraftBeats['scenes'][number]): string[] {
  return [
    ...stateLine('결정 상태: ', scene.decision),
    ...stateLine('기대한 것과 잃은 것: ', scene.stake),
  ]
}

function stateLine(label: string, value: string | undefined): string[] {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? [] : [`${label}${text}`]
}

/**
 * Location list of the beat scenes for the continuity check (P3, local two-step eval runs). Per scene:
 * place, people and objects only. The event order and the state lines are left out on purpose: the
 * check needs where things are, not the story beats.
 */
export function renderBeatLocations(beats: DraftBeats): string {
  if (beats.scenes.length === 0) return '(없음)'
  return beats.scenes
    .map((scene, index) => {
      const people = scene.characters.length > 0 ? scene.characters.join(', ') : '(없음)'
      const objects = scene.objects.length > 0 ? scene.objects.join('; ') : '(없음)'
      return [
        `장면 ${index + 1}`,
        `장소: ${scene.place}`,
        `인물: ${people}`,
        `물건: ${objects}`,
      ].join('\n')
    })
    .join('\n\n')
}

export const draftBeatsTask: AiTaskDef<DraftPromptInput, DraftBeats> = {
  name: 'draft-beats',
  effort: 'medium',
  maxTokens: 4000,
  system: DRAFT_BEATS_SYSTEM,
  // Same sections as the prose prompt (one source, no drift), without the length lines and beats.
  // The planned scene count goes last, from draftLengthPlan: the same source as the prose <scene_budget>.
  buildPrompt: (input) =>
    [
      buildDraftPrompt({ ...input, beats: null }, { omitTargetLength: true }),
      '',
      `<scene_count>${draftLengthPlan(input.targetChars).sceneCount}</scene_count>`,
    ].join('\n'),
  schema: DraftBeatsSchema,
}
