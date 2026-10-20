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

// Phrases a model uses when it talks to the author instead of continuing the story, for example
// when the draft already ends on its final line. Prompt tag names never belong in prose either.
const COMMENTARY_MARKERS = [
  /<\/?(?:draft_so_far|continue_length|target_length|instructions)>/,
  /이어\s*쓰지\s*않았/,
  /이어\s*쓴\s*부분은/,
  /원하시면/,
  /알려\s*주시면/,
  /골라\s*주세요/,
  /다시\s*(?:써|작성해)\s*드리겠/,
  /다시\s*작성하겠습니다/,
  /\b(?:I|I've)\s+(?:did not|didn't|will not|won't|have not|haven't)\s+(?:continue|continued)\b/i,
  /\bthe draft already\b/i,
  /\blet me know\b/i,
  /\bwould you like\b/i,
]

// Quoted spans are dialogue, where a character may well say "알려 주시면" or "let me know".
const QUOTED = /"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』/g

/** True when a continuation answer is a note to the author rather than story text. */
export function isContinuationCommentary(text: string): boolean {
  const narration = text.replace(QUOTED, ' ')
  return COMMENTARY_MARKERS.some((marker) => marker.test(narration))
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
 * `reason` is the AppError code, 'UNKNOWN' for a non-AppError, 'EMPTY' for an empty answer, or
 * 'COMMENTARY' for a note to the author instead of story text.
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
