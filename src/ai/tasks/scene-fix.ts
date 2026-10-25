// One-scene fix (stage 3, task 3): rewrites a single flagged scene so that the listed problems
// are gone, keeping the events, names, places, point of view and facts. The service in
// src/server/draft-check.ts (task 4) calls it at most twice per draft run and checks the answer
// with acceptSceneFix before anything is spliced in.

import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { renderCard, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { type DirectiveForPrompt, matchBan, withRequestsBlock } from '@/lib/directives'
import { draftCharCount } from '@/lib/draft-length'
import { isBreakLine } from '@/lib/scene'
import type { AiTaskDef } from '@/ai/types'

export type SceneFixReason = { label: string; note: string }

export type SceneFixInput = {
  /** The flagged scene text. */
  scene: string
  /** The last two paragraphs of the previous scene, or '' for the first scene. */
  before: string
  /** The first paragraph of the next scene, or '' for the last scene. */
  after: string
  /** The problems the rewrite must remove. */
  reasons: SceneFixReason[]
  /** The plan's scene the fix belongs to, or null without a plan. */
  planScene: string | null
  /** Active author requests; they lead the prompt when given. */
  requests: DirectiveForPrompt[]
  styleCards: DraftPromptInput['styleCards']
}

export type SceneFixOutput = { text: string }

export const SceneFixSchema: z.ZodType<SceneFixOutput> = z.object({
  text: z.string(),
})

export const SCENE_FIX_SYSTEM = `너는 웹소설의 한 장면을 고쳐 다시 쓰는 보조 작가다.
- <scene>의 장면만 다시 쓴다. 장면 밖의 내용은 다루지 않는다.
- <problems>에 적힌 문제가 모두 없어지도록 고친다.
- 장면의 사건, 인물 이름, 장소, 시점, 드러난 사실을 그대로 둔다. 새 사건을 더하지 않는다.
- <before>의 끝에서 자연스럽게 이어지고 <after>의 시작으로 넘어가게 쓴다. <before>와 <after>는 다시 쓰지 않는다.
- 핵심 순간은 요약하지 말고 행동과 대사로 보여준다. 인물의 감정이 바뀌면 그 계기가 되는 사건을 함께 쓴다.
- 길이는 원래 장면과 비슷하게 유지한다.
- 장면 구분선은 쓰지 않는다.
- <style_cards>가 있으면 그 말투와 규칙을 지킨다.
- <author_requests>가 있으면 고쳐 쓰는 장면도 그 요청을 지킨다.
${TAG_DATA_RULE}
- 해설이나 질문 없이 고친 장면 본문만 출력한다.`

function orNone(text: string): string {
  return text.trim() === '' ? '(없음)' : text
}

function nonBlank(text: string | null): string | null {
  if (text === null || text.trim() === '') return null
  return text
}

export const sceneFixTask: AiTaskDef<SceneFixInput, SceneFixOutput> = {
  name: 'scene-fix',
  effort: 'medium',
  maxTokens: 6000,
  system: SCENE_FIX_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    const cards =
      input.styleCards.length > 0 ? input.styleCards.map(renderCard).join('\n\n') : '(없음)'
    const parts = [`<style_cards>\n${cards}\n</style_cards>`]
    const planScene = nonBlank(input.planScene)
    if (planScene !== null) parts.push('', `<plan_scene>\n${planScene}\n</plan_scene>`)
    parts.push(
      '',
      `<before>\n${orNone(input.before)}\n</before>`,
      '',
      `<scene>\n${input.scene}\n</scene>`,
      '',
      `<after>\n${orNone(input.after)}\n</after>`,
      '',
      `<problems>\n${input.reasons.map((reason) => `- ${reason.label}: ${reason.note}`).join('\n')}\n</problems>`,
    )
    return withRequestsBlock(input.requests ?? [], parts.join('\n'))
  },
  schema: SceneFixSchema,
}

/** A fixed scene is usable when it is not empty, has no break line, keeps about the same length
 * (70–140% of the original) and adds no new ban hit for any ban request. */
export function acceptSceneFix(
  original: string,
  fixed: string,
  requests: DirectiveForPrompt[],
): boolean {
  if (fixed.trim() === '') return false
  if (fixed.split('\n').some((line) => isBreakLine(line))) return false
  const before = draftCharCount(original)
  const after = draftCharCount(fixed)
  if (before === 0) return false
  const ratio = after / before
  if (ratio < 0.7 || ratio > 1.4) return false
  for (const request of requests) {
    if (request.kind !== 'ban' || request.pattern === null) continue
    if (matchBan(fixed, request.pattern).length > matchBan(original, request.pattern).length) {
      return false
    }
  }
  return true
}
