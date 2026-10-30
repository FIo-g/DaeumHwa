import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// The verdict block a reviewer ends review.md with, and the gate that decides whether a run near
// the pass line gets a second, independent review (track M3). Pure apart from reviewGate's reads.

export const REVIEW_VERDICT_SCHEMA_ID = 'review-verdict-1'
export const SECOND_REVIEW_Q_MIN = 3.65
export const SECOND_REVIEW_Q_MAX = 3.85
export const SECOND_REVIEW_T_FAILS = 1
export const SECOND_REVIEW_FILE = 'review-2.md'

const THRESHOLD_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const
export type ThresholdId = (typeof THRESHOLD_IDS)[number]

const chapterSchema = z.object({
  chapter: z.number().int().min(1),
  thresholdsFailed: z.array(z.enum(THRESHOLD_IDS)),
  qScores: z.array(z.number().min(1).max(5)).length(9),
  verdict: z.enum(['publishable', 'excellent', 'not-publishable']),
  // Places the author must fix (criteria 3.6). Optional so reviews saved before this key still parse.
  mustFix: z.number().int().min(0).optional(),
})

const reviewVerdictSchema = z
  .object({
    schema: z.literal(REVIEW_VERDICT_SCHEMA_ID),
    chapters: z.array(chapterSchema).min(1),
  })
  .refine(
    (value) =>
      new Set(value.chapters.map((chapter) => chapter.chapter)).size === value.chapters.length,
    { message: 'chapter numbers must be unique', path: ['chapters'] },
  )

export type ChapterVerdict = z.infer<typeof chapterSchema>
export type ReviewVerdict = { schema: typeof REVIEW_VERDICT_SCHEMA_ID; chapters: ChapterVerdict[] }

export type VerdictParse =
  | { ok: true; verdict: ReviewVerdict }
  | { ok: false; code: 'no-verdict-block' | 'invalid-verdict-block'; detail: string }

// A json fence with an optional info-string space; the body is captured for parsing.
const JSON_FENCE = /```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g

/**
 * Reads the reviewer's verdict block. Only fences whose body names the schema id count, so other
 * json in the review is ignored. The last such fence is the reviewer's final word: if it is invalid,
 * the parse fails even when an earlier one was valid.
 */
export function parseReviewVerdict(text: string): VerdictParse {
  const candidates = [...text.matchAll(JSON_FENCE)]
    .map((match) => match[1] ?? '')
    .filter((body) => body.includes(REVIEW_VERDICT_SCHEMA_ID))
  const last = candidates.at(-1)
  if (last === undefined) {
    return {
      ok: false,
      code: 'no-verdict-block',
      detail: `no json block with schema ${REVIEW_VERDICT_SCHEMA_ID}`,
    }
  }
  let value: unknown
  try {
    value = JSON.parse(last)
  } catch (error) {
    return {
      ok: false,
      code: 'invalid-verdict-block',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  const result = reviewVerdictSchema.safeParse(value)
  if (!result.success) {
    return {
      ok: false,
      code: 'invalid-verdict-block',
      detail: result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    }
  }
  return { ok: true, verdict: result.data }
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The run's Q mean: the mean of the per-chapter means, rounded to two decimals. All R2 runs have one
 * chapter; with several, each chapter counts equally.
 */
export function runQMean(v: ReviewVerdict): number {
  const chapterMeans = v.chapters.map((chapter) => mean(chapter.qScores))
  return Math.round(mean(chapterMeans) * 100) / 100
}

/** True when the Q mean is inside the band, both ends included. */
export function qMeanNearLine(qMean: number): boolean {
  return qMean >= SECOND_REVIEW_Q_MIN && qMean <= SECOND_REVIEW_Q_MAX
}

export type SecondReviewReason =
  'q-mean-near-line' | 'single-threshold-failure' | 'no-verdict-block' | 'invalid-verdict-block'

export type SecondReviewCheck = {
  needed: boolean
  reasons: SecondReviewReason[]
  qMean: number | null
  tFailCount: number | null
  chapters: number | null
}

/**
 * Decides whether a run is near the pass line. A failed verdict block counts as needed, so a
 * missing check never silently skips the second review; the cost is one extra reviewer.
 */
export function checkSecondReview(parsed: VerdictParse): SecondReviewCheck {
  if (!parsed.ok) {
    return {
      needed: true,
      reasons: [parsed.code],
      qMean: null,
      tFailCount: null,
      chapters: null,
    }
  }
  const { verdict } = parsed
  const qMean = runQMean(verdict)
  // Distinct ids per chapter, summed over chapters.
  const tFailCount = verdict.chapters.reduce(
    (sum, chapter) => sum + new Set(chapter.thresholdsFailed).size,
    0,
  )
  const reasons: SecondReviewReason[] = []
  if (qMeanNearLine(qMean)) reasons.push('q-mean-near-line')
  if (tFailCount === SECOND_REVIEW_T_FAILS) reasons.push('single-threshold-failure')
  return {
    needed: reasons.length > 0,
    reasons,
    qMean,
    tFailCount,
    chapters: verdict.chapters.length,
  }
}

export type ReviewGateResult = SecondReviewCheck & {
  decision: 'needed' | 'not-needed' | 'already-done'
  parse: 'ok' | 'no-verdict-block' | 'invalid-verdict-block'
  detail: string | null
  mustFix: number | null
}

/**
 * Sums the must-fix places over chapters. null when any chapter lacks the count (an old review),
 * so a partial sum is never reported as the run's total.
 */
function sumMustFix(v: ReviewVerdict): number | null {
  let total = 0
  for (const chapter of v.chapters) {
    if (chapter.mustFix === undefined) return null
    total += chapter.mustFix
  }
  return total
}

/**
 * Reads the first review of a run dir and decides on the second review. 'already-done' when
 * review-2.md exists: the second review is never redone by this gate.
 */
export function reviewGate(runDir: string): ReviewGateResult {
  const review = path.join(runDir, 'review.md')
  if (!existsSync(review)) throw new Error(`review.md missing in ${runDir}`)
  const parsed = parseReviewVerdict(readFileSync(review, 'utf8'))
  const check = checkSecondReview(parsed)
  const parse = parsed.ok ? 'ok' : parsed.code
  const detail = parsed.ok ? null : parsed.detail
  const mustFix = parsed.ok ? sumMustFix(parsed.verdict) : null
  const alreadyDone = existsSync(path.join(runDir, SECOND_REVIEW_FILE))
  let decision: ReviewGateResult['decision'] = 'not-needed'
  if (alreadyDone) decision = 'already-done'
  else if (check.needed) decision = 'needed'
  return { ...check, decision, parse, detail, mustFix }
}
