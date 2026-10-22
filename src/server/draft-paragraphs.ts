import { runAiTask } from '@/ai/run'
import {
  type ParagraphTrimItem,
  type ParagraphTrimOutput,
  paragraphTrimTask,
} from '@/ai/tasks/paragraph-trim'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { AppError, isAppError } from '@/lib/errors'
import {
  overlongParagraphs,
  PARAGRAPH_MAX_SENTENCES,
  replaceParagraphs,
  splitParagraphs,
} from '@/lib/korean/paragraphs'
import { requireWorkRole } from '@/server/access'

// Trims paragraphs with too many sentences (spec 6, 7). Only the offenders are sent to the model,
// in batches of TRIM_BATCH, one call after another. Never writes wiki tables and never saves the
// manuscript: the caller decides what to keep.

/** Each round sends the offenders still left; a third round is never started. */
export const MAX_TRIM_ROUNDS = 2
/** Most offenders in one paragraph-trim call. Larger calls return shifted or cut answers. */
export const TRIM_BATCH = 12
/** Characters of each neighbour paragraph sent as context. */
const NEIGHBOUR_CHARS = 300

export type TrimResult = {
  text: string
  changed: boolean
  before: number
  after: number
  rounds: number
  runIds: string[]
}

/**
 * Rewrites the paragraphs of `input.text` that have more than `maxSentences` sentences. Editor
 * role. Each round sends its offenders in batches of TRIM_BATCH, in text order. A batch that fails
 * with an AppError is skipped and the other batches' fixes are kept. When every batch of the first
 * round fails, the first error is thrown; a later round that fails keeps the fixes already made.
 * A cancel always throws. Returns the text unchanged, with no AI call, when no paragraph is overlong.
 */
export async function trimOverlongParagraphs(
  db: Db,
  actor: Actor,
  input: { workId: string; text: string; maxSentences?: number },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<TrimResult> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const max = input.maxSentences ?? PARAGRAPH_MAX_SENTENCES
  const before = overlongParagraphs(input.text, max).length

  let current = input.text
  let rounds = 0
  const runIds: string[] = []
  while (rounds < MAX_TRIM_ROUNDS) {
    const offenders = overlongParagraphs(current, max)
    if (offenders.length === 0) break

    const paragraphs = splitParagraphs(current)
    const items: ParagraphTrimItem[] = offenders.map((offender) => {
      const previous = paragraphs[offender.index - 1]?.text
      const next = paragraphs[offender.index + 1]?.text
      return {
        index: offender.index,
        text: offender.text,
        before: previous === undefined ? null : previous.slice(-NEIGHBOUR_CHARS),
        after: next === undefined ? null : next.slice(0, NEIGHBOUR_CHARS),
      }
    })

    rounds += 1
    // Every batch answers against the text as it was at the start of the round, so the fixes are
    // applied together at the end of the round.
    const fixes: ParagraphTrimOutput['paragraphs'] = []
    let answered = 0
    let firstError: AppError | null = null
    for (let start = 0; start < items.length; start += TRIM_BATCH) {
      try {
        const run = await runAiTask(
          db,
          { userId: actor.userId, workId: input.workId, signal },
          paragraphTrimTask,
          { maxSentences: max, items: items.slice(start, start + TRIM_BATCH) },
          client,
        )
        runIds.push(run.runId)
        answered += 1
        fixes.push(...run.output.paragraphs)
      } catch (error) {
        // A cancel always reaches the caller; any other failure skips this batch only.
        if (!isAppError(error) || error.code === 'CANCELLED') throw error
        firstError ??= error
      }
    }
    if (answered === 0) {
      // Every batch failed: the first round is an error, a later round keeps the fixes made.
      if (rounds === 1 && firstError) throw firstError
      break
    }
    if (fixes.length === 0) break
    current = replaceParagraphs(current, fixes)
  }

  return {
    text: current,
    changed: current !== input.text,
    before,
    after: overlongParagraphs(current, max).length,
    rounds,
    runIds,
  }
}
