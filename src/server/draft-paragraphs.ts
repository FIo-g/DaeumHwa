import { runAiTask } from '@/ai/run'
import { type ParagraphTrimItem, type ParagraphTrimOutput, paragraphTrimTask } from '@/ai/tasks/paragraph-trim'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { isAppError } from '@/lib/errors'
import {
  overlongParagraphs,
  PARAGRAPH_MAX_SENTENCES,
  replaceParagraphs,
  splitParagraphs,
} from '@/lib/korean/paragraphs'
import { requireWorkRole } from '@/server/access'

// Trims paragraphs with too many sentences (spec 6, 7). Only the offenders are sent to the model.
// Never writes wiki tables and never saves the manuscript: the caller decides what to keep.

/** Each round sends the offenders still left; a third round is never started. */
export const MAX_TRIM_ROUNDS = 2
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
 * role. A failure in the first round is thrown; a failure in a later round keeps the fixes already
 * made. Returns the text unchanged, with no AI call, when no paragraph is overlong.
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
    let answer: ParagraphTrimOutput
    try {
      const run = await runAiTask(
        db,
        { userId: actor.userId, workId: input.workId, signal },
        paragraphTrimTask,
        { maxSentences: max, items },
        client,
      )
      answer = run.output
      runIds.push(run.runId)
    } catch (error) {
      if (rounds === 1 || !isAppError(error)) throw error
      break
    }
    if (answer.paragraphs.length === 0) break
    current = replaceParagraphs(current, answer.paragraphs)
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
