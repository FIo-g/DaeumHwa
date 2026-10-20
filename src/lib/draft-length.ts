// Length rules for the streamed chapter draft (spec 7). Pure functions: the prompt builder, the
// continuation driver and the failure warning all read their numbers from here.

import { countChars } from '@/lib/korean/chars'

/** A draft may run this far past the target before the author has to cut it. */
const MAX_RATIO = 1.2
/** A model undershoots what it is asked for, so the continuation asks for more than is missing. */
const CONTINUE_ASK_RATIO = 1.3
const CHARS_PER_SCENE = 1500
const MIN_SCENES = 2
const DETAIL_MAX_CHARS = 300

/**
 * Minimum, maximum and per-scene length of a draft, all counted with spaces. A given `sceneCount`
 * (integer >= 1, e.g. the length of a beat list) replaces the computed scene count.
 */
export function draftLengthPlan(
  target: number,
  sceneCount?: number,
): {
  minChars: number
  maxChars: number
  sceneCount: number
  charsPerScene: number
} {
  const count =
    sceneCount !== undefined && Number.isInteger(sceneCount) && sceneCount >= 1
      ? sceneCount
      : Math.max(MIN_SCENES, Math.round(target / CHARS_PER_SCENE))
  return {
    minChars: target,
    maxChars: Math.floor(target * MAX_RATIO),
    sceneCount: count,
    charsPerScene: Math.ceil(target / count),
  }
}

/** Length of a draft as the product counts it: trimmed, line breaks excluded, spaces included. */
export function draftCharCount(text: string): number {
  return countChars(text.trim()).withSpaces
}

/**
 * How much a continuation must add to reach the target. Null when the draft already reaches it.
 * `askMin` is 1.3 times the missing part; `askMax` never goes below `askMin`.
 */
export function continuationPlan(
  count: number,
  target: number,
): { count: number; askMin: number; askMax: number } | null {
  if (count >= target) return null
  const askMin = Math.ceil((target - count) * CONTINUE_ASK_RATIO)
  const askMax = Math.max(askMin, draftLengthPlan(target).maxChars - count)
  return { count, askMin, askMax }
}

/** Glue between the first draft and its continuation, so the joined text reads as one body. */
export function continuationSeparator(first: string): '' | '\n' | '\n\n' {
  if (first.endsWith('\n\n')) return ''
  if (first.endsWith('\n')) return '\n'
  return '\n\n'
}

/** Warning kept in the first run row when the continuation fails. The eval reads `reason` and `detail`. */
export type DraftWarning = {
  kind: 'continue-failed'
  reason: string
  detail: string
  message: '이어쓰기 실패'
}

/**
 * `reason` is the AppError code, 'UNKNOWN' for a non-AppError, or 'EMPTY' for an empty answer.
 * `detail` is cut to 300 characters.
 */
export function continueFailedWarning(reason: string, detail: string): DraftWarning {
  return {
    kind: 'continue-failed',
    reason,
    detail: detail.slice(0, DETAIL_MAX_CHARS),
    message: '이어쓰기 실패',
  }
}
