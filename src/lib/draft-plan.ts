// Pure helpers for the chapter plan card (stage 1 of the lean harness): per-scene targets, the
// warnings the card view shows, and the instruction text the draft receives from an approved card.

import type { DraftPlan, EndingDevice, SceneRole } from '@/ai/tasks/draft-plan'
import { draftLengthPlan } from '@/lib/draft-length'

// Omit before the intersection: a plain DraftPlan & { scenes } would intersect the two scene arrays
// and hide targetChars from each scene.
export type DraftPlanCard = Omit<DraftPlan, 'scenes'> & {
  scenes: (DraftPlan['scenes'][number] & { targetChars: number })[]
}

/** How the author changed the card before writing: counted per edit, stored with the draft run. */
export type PlanEdits = { revisions: number; removed: number; moved: number; textEdits: number }

/** First line of the rendered plan: tells the draft how to follow the card. Shared with the English scaffold. */
export const PLAN_INTRO_RULE =
  '아래 회차 계획을 따라 쓴다. 장면이 바뀔 때는 빈 줄, *** 한 줄, 빈 줄을 둔다. 장면마다 적힌 분량을 채운다. 마지막 장면은 요약이나 교훈으로 닫지 말고 "회차 끝"에 적힌 장면으로 끝낸다.'

export const SCENE_ROLE_LABELS: Record<SceneRole, string> = {
  opening: '도입',
  turn: '전환',
  rise: '고조',
  ending: '회차 끝',
}

export const ENDING_DEVICE_LABELS: Record<EndingDevice, string> = {
  question: '질문',
  crisis: '위기',
  twist: '반전',
}

/** Longest text the card accepts (DraftPlanCardSchema), counted in UTF-16 units like zod does. */
export const PLAN_TEXT_MAX = 400
/** Longest list (names, threads) the card accepts (DraftPlanCardSchema). */
export const PLAN_LIST_MAX = 12

/** Trims, then cuts to `max` units without leaving half of a surrogate pair at the end. */
function cutText(text: string, max: number = PLAN_TEXT_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  let cut = trimmed.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut
}

/**
 * Brings a model output within the limits the card accepts: texts are trimmed and cut to
 * PLAN_TEXT_MAX, names and threads are cut to PLAN_LIST_MAX entries. Keeps the plan otherwise.
 */
export function clampPlan(plan: DraftPlan): DraftPlan {
  return {
    scenes: plan.scenes.map((scene) => ({
      summary: cutText(scene.summary),
      goal: cutText(scene.goal),
      decision: cutText(scene.decision),
      stake: cutText(scene.stake),
      trigger: cutText(scene.trigger),
      role: scene.role,
      place: cutText(scene.place),
      characters: scene.characters.slice(0, PLAN_LIST_MAX).map((name) => cutText(name)),
    })),
    ending: { device: plan.ending.device, line: cutText(plan.ending.line) },
    threads: plan.threads.slice(0, PLAN_LIST_MAX).map((title) => cutText(title)),
  }
}

/**
 * Gives every scene an equal share of the chapter target (spaces included). The plan is clamped
 * first, so the card it returns always passes DraftPlanCardSchema.
 */
export function withSceneTargets(plan: DraftPlan, targetChars: number): DraftPlanCard {
  const clamped = clampPlan(plan)
  const perScene = draftLengthPlan(targetChars, clamped.scenes.length).charsPerScene
  return {
    ...clamped,
    scenes: clamped.scenes.map((scene) => ({ ...scene, targetChars: perScene })),
  }
}

/**
 * Cleans a card that came from the client (already checked by DraftPlanCardSchema): trims the text,
 * drops empty names and threads, and recomputes every per-scene target from the chapter target.
 */
export function normalizeCard(card: DraftPlanCard, targetChars: number): DraftPlanCard {
  const plan: DraftPlan = {
    scenes: card.scenes.map((scene) => ({
      summary: scene.summary.trim(),
      goal: scene.goal.trim(),
      decision: scene.decision.trim(),
      stake: scene.stake.trim(),
      trigger: scene.trigger.trim(),
      role: scene.role,
      place: scene.place.trim(),
      characters: scene.characters.map((name) => name.trim()).filter((name) => name !== ''),
    })),
    ending: { device: card.ending.device, line: card.ending.line.trim() },
    threads: card.threads.map((title) => title.trim()).filter((title) => title !== ''),
  }
  return withSceneTargets(plan, targetChars)
}

/** Warnings under the card heading: same beat twice in a row, and a last scene that is not the ending. */
export function planWarnings(card: DraftPlanCard): string[] {
  const warnings: string[] = []
  card.scenes.forEach((scene, i) => {
    const next = card.scenes[i + 1]
    if (next && next.role === scene.role) {
      const label = SCENE_ROLE_LABELS[scene.role]
      warnings.push(
        `${i + 1}번째와 ${i + 2}번째 장면이 둘 다 '${label}'입니다. 같은 박자가 이어질 수 있어요.`,
      )
    }
  })
  const last = card.scenes[card.scenes.length - 1]
  if (last && last.role !== 'ending') {
    warnings.push("마지막 장면이 '회차 끝'이 아닙니다.")
  }
  return warnings
}

/**
 * The text the draft receives as <instructions> for an approved card. The author line comes first;
 * each scene lists its state lines (decision, stake and trigger are left out when empty).
 */
export function renderPlanInstructions(authorLine: string, card: DraftPlanCard): string {
  const lines = [`작가 메모: ${authorLine.trim() === '' ? '(없음)' : authorLine}`, PLAN_INTRO_RULE]
  card.scenes.forEach((scene, i) => {
    lines.push(
      `장면 ${i + 1} (${SCENE_ROLE_LABELS[scene.role]}, 공백 포함 약 ${formatCount(scene.targetChars)}자)`,
      `- 일어나는 일: ${orNone(scene.summary)}`,
      `- 목표: ${orNone(scene.goal)}`,
    )
    if (scene.decision.trim() !== '') lines.push(`- 결정 상태: ${scene.decision}`)
    if (scene.stake.trim() !== '') lines.push(`- 기대한 것과 잃은 것: ${scene.stake}`)
    if (scene.trigger.trim() !== '') lines.push(`- 감정의 계기: ${scene.trigger}`)
    lines.push(
      `- 장소: ${orNone(scene.place)} / 인물: ${scene.characters.length > 0 ? scene.characters.join(', ') : '(없음)'}`,
    )
  })
  lines.push(
    `회차 끝 (${ENDING_DEVICE_LABELS[card.ending.device]}): ${orNone(card.ending.line)}`,
    `움직일 떡밥: ${card.threads.length > 0 ? card.threads.join(', ') : '(없음)'}`,
  )
  return lines.join('\n')
}

function orNone(text: string): string {
  return text.trim() === '' ? '(없음)' : text
}

/** 1250 becomes "1,250". */
function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
