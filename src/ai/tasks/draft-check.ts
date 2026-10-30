// Cheap AI check of a finished draft (stage 3, task 2): the model reads the numbered draft
// against a short rubric and names only the weak scenes with reasons. Code-owned reasons (ban
// and speech requests) are left out of the prompt: the code check in src/lib/draft-check.ts
// covers them. The service in src/server/draft-check.ts (task 4) runs this once per draft run.

import { z } from 'zod'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import type { AiTaskDef } from '@/ai/types'
import { type DirectiveForPrompt, renderRequestsBlock } from '@/lib/directives'
import type { SceneRange } from '@/lib/scene'

export type DraftCheckInput = {
  /** The draft with each span prefixed by a `[장면 N]` line (see `numberScenes`). */
  numbered: string
  sceneCount: number
  /** The approved card rendered by stage 1 `renderPlanInstructions`, or null without a plan. */
  plan: string | null
  /** The author's instruction text with the card-chain plan notes, or null when neither exists. */
  instructions: string | null
  /** Active author requests; only style and content ones enter the prompt. */
  requests: DirectiveForPrompt[]
  /** Work facts hidden at the draft's position, latest first. */
  hiddenFacts: string[]
}

export const DRAFT_CHECK_CODES = [
  'missing-event',
  'skipped-moment',
  'unmotivated-feeling',
  'repeated-beat',
  'flat-ending',
  'request',
  'leak',
] as const

export type DraftCheckCode = (typeof DRAFT_CHECK_CODES)[number]

export type DraftCheckReason = { code: DraftCheckCode; note: string }
export type DraftCheckScene = { scene: number; reasons: DraftCheckReason[] }
export type DraftCheckOutput = { scenes: DraftCheckScene[] }

const DraftCheckReasonSchema: z.ZodType<DraftCheckReason> = z.object({
  code: z.enum(DRAFT_CHECK_CODES),
  note: z.string().max(80),
})

export const DraftCheckSchema: z.ZodType<DraftCheckOutput> = z.object({
  scenes: z.array(
    z.object({
      scene: z.number().int().min(1),
      reasons: z.array(DraftCheckReasonSchema).max(3),
    }),
  ),
})

export const DRAFT_CHECK_SYSTEM = `당신은 웹소설 한 회차의 초안을 점검하는 보조 작가다. 초안을 다시 쓰지 않고, 긴 문장을 인용하지 않는다.
규칙:
- 장면은 아래 경우에만 지적하고, 각각 80자 이내의 짧은 note와 함께 쓴다.
- missing-event: <instructions>나 계획의 장면이 요구한 사건이 그 장면에서 일어나지 않는다. note에는 그 사건을 적는다. 계획이 다른 장면으로 옮긴 사건은 옮긴 장면에서 판단한다.
- skipped-moment: 계획이나 장면의 핵심 순간을 보여주지 않고 요약으로 넘긴다.
- unmotivated-feeling: 계기가 되는 사건 없이 인물의 감정이 바뀐다.
- repeated-beat: 그 장면이 바로 앞 장면의 흐름이나 주고받기를 되풀이한다.
- flat-ending: 마지막 장면에만 쓴다. 회차가 질문, 위기, 반전 없이 끝난다.
- request: <author_requests> 중 하나를 어긴다.
- leak: <hidden_facts> 중 하나를 드러내거나 강하게 암시한다.
- 확실한 경우만 지적한다. 문제가 분명하지 않은 장면은 빼고, 분명한 문제가 없으면 {"scenes": []}를 돌려준다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/**
 * The numbered draft for the check prompt: each span prefixed with a `[장면 N]` line, spans in
 * order joined by a blank line. Break lines stay out because spans exclude them.
 */
export function numberScenes(text: string, spans: SceneRange[]): string {
  return spans.map((span, i) => `[장면 ${i + 1}]\n${text.slice(span.start, span.end)}`).join('\n\n')
}

/** Only the prompt-owned requests enter the check: ban and speech are covered by code checks. */
function checkableRequests(requests: DirectiveForPrompt[]): DirectiveForPrompt[] {
  return requests.filter((d) => d.kind === 'style' || d.kind === 'content')
}

function nonBlank(text: string | null): string | null {
  if (text === null || text.trim() === '') return null
  return text
}

export const draftCheckTask: AiTaskDef<DraftCheckInput, DraftCheckOutput> = {
  name: 'draft-check',
  effort: 'low',
  maxTokens: 3000,
  system: DRAFT_CHECK_SYSTEM,
  buildPrompt: (raw) => {
    const input = neutralizeDeep(raw)
    const parts = [`<draft>\n${input.numbered}\n</draft>`]
    const instructions = nonBlank(input.instructions)
    if (instructions !== null) parts.push('', `<instructions>\n${instructions}\n</instructions>`)
    const plan = nonBlank(input.plan)
    if (plan !== null) parts.push('', `<plan>\n${plan}\n</plan>`)
    const block = renderRequestsBlock(checkableRequests(input.requests ?? []))
    if (block !== '') parts.push('', block)
    const facts = (input.hiddenFacts ?? []).map((fact) => fact.trim()).filter((fact) => fact !== '')
    if (facts.length > 0) {
      parts.push(
        '',
        `<hidden_facts>\n${facts.map((fact) => `- ${fact}`).join('\n')}\n</hidden_facts>`,
      )
    }
    return parts.join('\n')
  },
  schema: DraftCheckSchema,
  postProcess(output, input) {
    const scenes: DraftCheckScene[] = []
    for (const scene of output.scenes) {
      if (scene.scene > input.sceneCount) continue
      const reasons = scene.reasons
        .map((reason) => ({ code: reason.code, note: reason.note.trim() }))
        .filter((reason) => reason.note !== '')
      if (reasons.length === 0) continue
      scenes.push({ scene: scene.scene, reasons: reasons.slice(0, 3) })
      if (scenes.length >= 4) break
    }
    return { scenes }
  },
}
