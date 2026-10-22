import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { DEFAULT_AI_TIMEOUT_MS, runAiTask, throwIfCancelled } from '@/ai/run'
import { applyDraftEdits, draftRepairTask } from '@/ai/tasks/draft-repair'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError, isAppError } from '@/lib/errors'
import { type DiffPart, diffTexts } from '@/lib/diff'
import { draftCharCount } from '@/lib/draft-length'
import type { AppliedRefinement, DraftRefinePreview, RefineRepairState } from '@/lib/draft-refine'
import { findDraftFlags } from '@/lib/korean/style-copy'
import { requireWorkRole } from '@/server/access'
import { requestsForText } from '@/server/directives'
import { trimOverlongParagraphs } from '@/server/draft-paragraphs'
import { listEntries } from '@/server/wiki'
import { listStyleCards } from '@/server/styles'

// "다듬기" on a finished draft (product only). Runs the round-1 passes in the eval's order: the
// paragraph trim (E1), then the flagged-sentence repair (E2). The result is kept in the run's
// output as a candidate; apply promotes it to the draft text. The manuscript is never touched.
//
// Two preview requests can overlap (a cancelled request may keep running on the server). So a
// preview only ever writes the `refinement` key, and only while the stored text is still the one
// it read; each candidate has a token, and apply promotes only the candidate the author saw.

/** The whole refine call must finish under the route's 300 s limit, with some margin. */
export const REFINE_BUDGET_MS = 280_000
/** The sentence repair is skipped when less time than this is left. */
export const MIN_REPAIR_MS = 20_000

type Refinement = {
  base: string
  text: string
  paragraphs: number
  sentences: number
  /** Names this candidate; apply must present the token of the preview the author saw. */
  token: string
}

/** Runs E1 and E2 on the stored draft and keeps the result as a candidate. Editor role. */
export async function previewDraftRefinement(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string },
  client?: AiClient,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<DraftRefinePreview> {
  const { workId, runId } = input
  const startedAt = now()
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const { run, output, stored } = await loadDraftRun(db, actor, workId, runId)

  // E1: a failure here is thrown; the author retries.
  const trimmed = await trimOverlongParagraphs(db, actor, { workId, text: stored }, client, signal)

  // E2: collect flags on the trimmed text exactly like repairDraft does (keep in sync with
  // repairDraft). The lines repeat here so that src/server/ai-features.ts stays unchanged.
  const examples = (await listStyleCards(db, actor, workId))
    .map((card) => card.examples)
    .filter((example) => example.trim() !== '')
  const exempt = (await listEntries(db, actor, workId)).flatMap((entry) => [
    entry.name,
    ...entry.aliases,
  ])
  const flags = findDraftFlags(trimmed.text, { examples, exempt })

  let refined = trimmed.text
  let repaired = 0
  let repairState: RefineRepairState = 'none'
  if (flags.length > 0) {
    const remaining = REFINE_BUDGET_MS - (now() - startedAt)
    if (remaining < MIN_REPAIR_MS) {
      repairState = 'skipped'
    } else {
      const requests = await requestsForText(db, workId, {
        chapterId: run.chapterId,
        text: trimmed.text,
      })
      try {
        const { output: edits } = await runAiTask(
          db,
          {
            userId: actor.userId,
            workId,
            chapterId: run.chapterId,
            signal,
            timeoutMs: Math.min(draftRepairTask.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS, remaining),
          },
          draftRepairTask,
          { text: trimmed.text, flags, requests },
          client,
        )
        throwIfCancelled(signal)
        const applied = applyDraftEdits(trimmed.text, flags, edits.edits)
        refined = applied.text
        repaired = applied.applied
        repairState = 'done'
      } catch (error) {
        // A cancel is rethrown; any other AI failure keeps the trim result. When the trim changed
        // nothing there is no result to keep, so the failure is rethrown and the author sees why.
        if (!isAppError(error) || error.code === 'CANCELLED' || trimmed.text === stored) throw error
        repairState = 'failed'
      }
    }
  }

  throwIfCancelled(signal)
  const changed = refined !== stored
  const token = randomUUID()
  let written = true
  if (changed) {
    const refinement: Refinement = {
      base: stored,
      text: refined,
      paragraphs: trimmed.before - trimmed.after,
      sentences: repaired,
      token,
    }
    written = await updateWhileDraftIs(
      db,
      runId,
      stored,
      sql`jsonb_set(${aiRuns.output}, '{refinement}', ${JSON.stringify(refinement)}::jsonb)`,
    )
  } else if ('refinement' in output) {
    // A stale candidate from an earlier preview is dropped.
    written = await updateWhileDraftIs(db, runId, stored, sql`${aiRuns.output} - 'refinement'`)
  }
  if (!written) {
    // The draft changed while this preview ran (an apply or a newer preview won).
    throw new AppError('BAD_STATE', '초안이 바뀌어 다듬기 결과를 버렸습니다. 다시 다듬어 주세요.')
  }

  const parts: DiffPart[] = changed ? diffTexts(stored, refined, 'words') : []
  return {
    runId,
    token,
    changed,
    parts,
    paragraphsBefore: trimmed.before,
    paragraphsAfter: trimmed.after,
    flagged: flags.length,
    repaired,
    repairState,
    beforeChars: draftCharCount(stored),
    afterChars: draftCharCount(refined),
  }
}

/** Promotes the stored candidate to the draft text. Fails when the draft changed since the preview. Editor role. */
export async function applyDraftRefinement(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; token: string },
): Promise<AppliedRefinement> {
  const { workId, runId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const { output, stored } = await loadDraftRun(db, actor, workId, runId)

  const candidate = readRefinement(output.refinement)
  if (candidate === null) {
    throw new AppError('BAD_STATE', '적용할 다듬기 결과가 없습니다. 다시 다듬어 주세요.')
  }
  if (candidate.token !== input.token) {
    throw new AppError('BAD_STATE', '다듬기 결과가 바뀌었습니다. 다시 다듬어 주세요.')
  }
  if (candidate.base !== stored) {
    throw new AppError('BAD_STATE', '초안이 바뀌어 적용할 수 없습니다. 다시 다듬어 주세요.')
  }

  // Conditional on the text and the candidate still being the ones checked above, so a preview or
  // an apply that ran in between is not overwritten.
  const updated = await db
    .update(aiRuns)
    .set({
      output: {
        ...withoutRefinement(output),
        text: candidate.text,
        originalText: typeof output.originalText === 'string' ? output.originalText : stored,
        refined: { paragraphs: candidate.paragraphs, sentences: candidate.sentences },
      },
    })
    .where(
      and(
        eq(aiRuns.id, runId),
        sql`${aiRuns.output}->>'text' = ${candidate.base}`,
        sql`${aiRuns.output}->'refinement'->>'token' = ${candidate.token}`,
      ),
    )
    .returning({ id: aiRuns.id })
  if (updated.length === 0) {
    throw new AppError('BAD_STATE', '다듬기 결과가 바뀌었습니다. 다시 다듬어 주세요.')
  }
  return { runId, text: candidate.text }
}

/** Loads a finished draft run of the actor. The same checks and messages as repairDraft. */
async function loadDraftRun(db: Db, actor: Actor, workId: string, runId: string) {
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  if (
    !run ||
    run.workId !== workId ||
    run.userId !== actor.userId ||
    run.task !== 'draft-chapter'
  ) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (run.status !== 'done') {
    throw new AppError('BAD_STATE', '초안 작성이 끝난 뒤에 다듬을 수 있습니다.')
  }
  const stored = draftText(run.output)
  if (stored === null) throw new AppError('BAD_STATE', '저장된 초안을 읽을 수 없습니다.')
  return { run, output: run.output as Record<string, unknown>, stored }
}

/** Same as the private draftText in ai-features.ts (not exported there; that file is not edited). */
function draftText(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'text' in output) {
    const text = (output as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return null
}

/**
 * Sets `output` of the run to `value` only while its stored text still equals `stored`. Returns
 * whether a row was updated. `value` is a SQL expression over the current output, so only the key
 * it changes is written and the rest of the output is never replaced from an old snapshot.
 */
async function updateWhileDraftIs(
  db: Db,
  runId: string,
  stored: string,
  value: ReturnType<typeof sql>,
): Promise<boolean> {
  const updated = await db
    .update(aiRuns)
    .set({ output: value })
    .where(and(eq(aiRuns.id, runId), sql`${aiRuns.output}->>'text' = ${stored}`))
    .returning({ id: aiRuns.id })
  return updated.length > 0
}

function withoutRefinement(output: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'refinement'))
}

function readRefinement(value: unknown): Refinement | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.base === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.paragraphs === 'number' &&
    typeof candidate.sentences === 'number' &&
    typeof candidate.token === 'string'
  ) {
    return {
      base: candidate.base,
      text: candidate.text,
      paragraphs: candidate.paragraphs,
      sentences: candidate.sentences,
      token: candidate.token,
    }
  }
  return null
}
