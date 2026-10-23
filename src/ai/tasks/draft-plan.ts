// Chapter plan card (stage 1 of the lean harness): before a draft, the model proposes the scenes of
// the chapter. The card comes from the same context as the draft, and the author approves or
// corrects it. The approved card then becomes the draft's instructions (src/lib/draft-plan.ts).

import { z } from 'zod'
import { neutralizeDeep, neutralizeTags, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { buildDraftPrefix, buildDraftPrompt, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import {
  PLAN_LIST_MAX,
  PLAN_TEXT_MAX,
  renderPlanInstructions,
  type DraftPlanCard,
} from '@/lib/draft-plan'
import type { AiTaskDef } from '@/ai/types'

/** Most scenes a plan card can have: the schemas, the plan call and the revision clamp all use it. */
export const PLAN_MAX_SCENES = 8

export const SCENE_ROLES = ['opening', 'turn', 'rise', 'ending'] as const
export type SceneRole = (typeof SCENE_ROLES)[number]

export const ENDING_DEVICES = ['question', 'crisis', 'twist'] as const
export type EndingDevice = (typeof ENDING_DEVICES)[number]

export type DraftPlan = {
  scenes: {
    /** What happens in the scene, one or two sentences. */
    summary: string
    /** What the point-of-view character wants in the scene. */
    goal: string
    /** Decision state at the end of the scene, or not yet decided. One sentence. */
    decision: string
    /** What the character expected and what was lost or not gained. One sentence. */
    stake: string
    /** The concrete event that changes a character's feeling in the scene; empty when none changes. */
    trigger: string
    role: SceneRole
    place: string
    characters: string[]
  }[]
  ending: { device: EndingDevice; line: string }
  /** Titles of wiki threads this chapter moves. Only titles that exist in the wiki. */
  threads: string[]
  /**
   * Requests the author should keep beyond this chapter, suggested for the author to keep as ledger
   * rows. Absent in plans stored before stage 2.
   */
  requests?: string[]
}

/** Most suggested requests a plan carries, and the longest one (DraftPlanSchema and the card). */
export const PLAN_REQUEST_MAX = 3
export const PLAN_REQUEST_TEXT_MAX = 120

const DraftPlanSceneSchema = z.object({
  summary: z.string(),
  goal: z.string(),
  decision: z.string(),
  stake: z.string(),
  trigger: z.string(),
  role: z.enum(SCENE_ROLES),
  place: z.string(),
  characters: z.array(z.string()),
})

const DraftPlanEndingSchema = z.object({
  device: z.enum(ENDING_DEVICES),
  line: z.string(),
})

export const DraftPlanSchema: z.ZodType<DraftPlan> = z.object({
  // One to eight scenes: the call fails and is recorded as one when the model goes outside that.
  scenes: z.array(DraftPlanSceneSchema).min(1).max(PLAN_MAX_SCENES),
  ending: DraftPlanEndingSchema,
  threads: z.array(z.string()),
  requests: z.array(z.string().max(PLAN_REQUEST_TEXT_MAX)).max(PLAN_REQUEST_MAX).default([]),
})

const CardText = z.string().max(PLAN_TEXT_MAX)

/**
 * The card the author sends back (an approved or edited card). Client input goes into the prompt, so
 * every string and list is capped here; model output (DraftPlanSchema) is not. Targets are recomputed
 * on the server.
 */
export const DraftPlanCardSchema: z.ZodType<DraftPlanCard> = z.object({
  scenes: z
    .array(
      z.object({
        summary: CardText,
        goal: CardText,
        decision: CardText,
        stake: CardText,
        trigger: CardText,
        role: z.enum(SCENE_ROLES),
        place: CardText,
        characters: z.array(CardText).max(PLAN_LIST_MAX),
        targetChars: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(PLAN_MAX_SCENES),
  ending: z.object({ device: z.enum(ENDING_DEVICES), line: CardText }),
  threads: z.array(CardText).max(PLAN_LIST_MAX),
  requests: z.array(z.string().max(PLAN_REQUEST_TEXT_MAX)).max(PLAN_REQUEST_MAX).default([]),
})

export type DraftPlanInput = DraftPromptInput & {
  /** Scene count of the plan: from draftLengthPlan, or the scene count of a revised card. */
  sceneCount: number
  /** Text of the newest direction advice for the previous chapter; null when there is none. */
  advice: string | null
  /** A current card and the author's one-line note to change it. Null for a first plan. */
  revision: { card: DraftPlanCard; note: string } | null
}

export const DRAFT_PLAN_SYSTEM = `당신은 웹소설 한 회차의 계획을 본문을 쓰기 전에 제안하는 보조 작가다.
규칙:
- 작가의 지시(<instructions>)에 사건이 있으면 그 사건을 모두 순서대로 장면에 넣는다. 지시가 짧거나 비어 있으면 위키(<wiki>)의 떡밥, <previous_summary>, <previous_tail>, <direction_advice>를 보고 이번 회차의 사건을 제안한다. 지난 회차에서 바로 이어 간다.
- <scene_count>에 적힌 개수의 장면을 정확히 만든다.
- 장면마다 summary(일어나는 일, 한두 문장), goal(시점 인물이 그 장면에서 원하는 것), decision(그 장면이 끝날 때 인물이 정한 것, 또는 아직 정하지 못한 것, 한 문장), stake(인물이 바란 것과 얻지 못하거나 잃은 것, 한 문장), trigger(장면에서 인물의 감정이 바뀌는 때와 그 원인이 된 구체적인 사건, 감정이 바뀌지 않으면 빈 문자열), role, place, characters를 쓴다.
- 지시와 위키에서 알 수 없는 decision, stake, trigger는 빈 문자열("")로 둔다. 지어내지 않는다.
- role은 opening, turn, rise, ending 중 하나다. 첫 장면은 opening, 마지막 장면은 ending으로 쓴다. 같은 role을 두 장면 연속으로 쓰지 않는다.
- ending.device는 question, crisis, twist 중 하나다. ending.line은 마지막 장면이 어떻게 끝나는지 한 문장으로, 요약이나 교훈이 아니라 장면 안의 한 순간으로 쓴다.
- threads에는 이 회차가 움직이는 <wiki> 떡밥의 제목만 쓴다. 위키에 있는 제목만 쓴다.
- requests: 작가 지시나 메모 가운데 이번 화를 넘어 계속 지켜야 할 요청만 한 문장씩 적는다(최대 3개). <author_requests>에 이미 있는 것, 이번 화의 사건, "더 재미있게" 같은 막연한 말은 넣지 않는다. 없으면 []
- <wiki>의 떡밥 중 "지시에 있을 때만 쓴다"로 표시된 것은 작가의 지시(<instructions>)나 <revision>의 작가 메모에 그 떡밥이 나올 때만 계획과 threads에 넣는다.
- 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.
- <revision>이 있으면 "현재 계획"을 작가 메모대로만 고친다. 메모가 건드리지 않는 장면은 그대로 둔다.
- 인물과 장소의 이름은 위키에 적힌 그대로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

/**
 * The plan call: the draft prompt without length lines, then the scene count, the advice and, for a
 * revision, the current card and the author's note. Tags are plain XML-style like the draft prompt.
 */
export const draftPlanTask: AiTaskDef<DraftPlanInput, DraftPlan> = {
  name: 'draft-plan',
  effort: 'low',
  maxTokens: 4000,
  system: DRAFT_PLAN_SYSTEM,
  buildPromptPrefix: buildDraftPrefix,
  buildPrompt: (input) =>
    [
      buildDraftPrompt({ ...input, beats: null }, { omitTargetLength: true }),
      '',
      `<scene_count>${input.sceneCount}</scene_count>`,
      '',
      '<direction_advice>',
      neutralizeTags(input.advice ?? '(없음)'),
      '</direction_advice>',
      ...revisionSection(input.revision),
    ].join('\n'),
  schema: DraftPlanSchema,
}

/** The <revision> block; empty without a revision. */
function revisionSection(revision: DraftPlanInput['revision']): string[] {
  if (!revision) return []
  return [
    '',
    '<revision>',
    '현재 계획:',
    renderPlanInstructions('', neutralizeDeep(revision.card)),
    `작가 메모: ${neutralizeTags(revision.note)}`,
    '</revision>',
  ]
}
