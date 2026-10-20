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
  scenes: { place: string; characters: string[]; objects: string[]; sequence: string[] }[]
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
      }),
    )
    .min(1),
})

export const DRAFT_BEATS_SYSTEM = `당신은 웹소설 초안의 장면 구성을 돕는 보조 작가다. 작가의 지시에 있는 사건을 장면 목록으로 나눈다.
규칙:
- 작가의 지시(<instructions>)에 있는 사건을 <scene_count>에 적힌 개수의 장면으로 나누고, 이야기 순서대로 놓는다. 장면 수를 늘리거나 줄이지 않는다.
- 사건이 장면 수보다 적으면 긴 사건을 앞부분과 뒷부분으로 나누되 장소는 바꾸지 않는다. 사건이 장면 수보다 많으면 이어지는 사건을 한 장면으로 묶는다.
- 장면마다 장소, 그 자리에 있는 인물, 물건과 그 물건이 있는 곳(또는 들고 있는 인물), 사건 순서를 쓴다.
- 사건 순서는 일어난 순서대로 짧은 문장 하나씩 쓴다.
- 설정 위키(<wiki>)와 작가의 지시에 있는 내용만 쓴다. 지시에 없는 사건을 지어내지 않는다.
- 인물과 장소의 이름은 위키에 적힌 그대로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/**
 * Renders the beat list as plain text for the <beats> section. Scenes are separated by one blank
 * line. An empty list, people, objects or sequence is written as (없음), so no line is dropped.
 */
export function renderBeats(beats: DraftBeats): string {
  if (beats.scenes.length === 0) return '(없음)'
  return beats.scenes.map(renderScene).join('\n\n')
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
    '순서:',
    ...sequence,
  ].join('\n')
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
