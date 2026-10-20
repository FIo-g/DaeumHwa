import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents, chapters } from '@/db/schema'
import type { Actor, UsageEventKind } from '@/db/types'
import { diffStats, diffTexts } from '@/lib/diff'
import { requireWorkRole } from '@/server/access'
import { AppError } from '@/lib/errors'

// Usage events (stage 0): counts and ratios only. Nothing here stores manuscript or instruction
// text, so the rows are safe to keep for the harness numbers.

/** Longer texts are skipped: the word diff on them costs more than a usage number is worth. */
const MAX_RATIO_CHARS = 40_000

const ExtraSchema = z.record(z.string(), z.number())

/**
 * Records one usage event. Editor role. Throws NOT_FOUND for non-members and for a chapter that
 * is missing or belongs to another work.
 */
export async function recordUsageEvent(
  db: Db,
  actor: Actor,
  input: {
    workId: string
    chapterId?: string | null
    runId?: string | null
    kind: UsageEventKind
    value: number
    extra?: Record<string, number>
  },
): Promise<void> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  if (input.chapterId) {
    const [chapter] = await db
      .select({ workId: chapters.workId })
      .from(chapters)
      .where(eq(chapters.id, input.chapterId))
      .limit(1)
    if (!chapter || chapter.workId !== input.workId) {
      throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
    }
  }
  const extra = ExtraSchema.parse(input.extra ?? {})
  await db.insert(aiUsageEvents).values({
    workId: input.workId,
    userId: actor.userId,
    chapterId: input.chapterId ?? null,
    runId: input.runId ?? null,
    kind: input.kind,
    value: input.value,
    extra,
  })
}

/**
 * Records that a finished draft was appended to a chapter. `value` is the AI text length and
 * `extra.mode` is 1 (appended). A run that is not the actor's, or has no text, records nothing.
 */
export async function recordDraftUse(
  db: Db,
  actor: Actor,
  input: { workId: string; chapterId: string; runId: string; priorChars: number },
): Promise<void> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, input.runId)).limit(1)
  if (!run || run.workId !== input.workId || run.userId !== actor.userId) return
  const aiText = draftTextOf(run.output)
  if (aiText === null) return
  await recordUsageEvent(db, actor, {
    workId: input.workId,
    chapterId: input.chapterId,
    runId: input.runId,
    kind: 'draft_used',
    value: aiText.length,
    extra: { mode: 1, priorChars: input.priorChars },
  })
}

/**
 * Updates the edit ratio of a chapter that was created from a draft: the share of the AI text
 * the author changed, in code points over the AI text length. Runs after a save, so it is best
 * effort: callers catch its errors. Skips texts over the size limit.
 */
export async function updateDraftEditRatio(
  db: Db,
  workId: string,
  chapterId: string,
  body: string,
): Promise<void> {
  // Only events of the chapter's own work count: a stray event must not decide the ratio.
  const used = await db
    .select()
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workId, workId),
        eq(aiUsageEvents.chapterId, chapterId),
        eq(aiUsageEvents.kind, 'draft_used'),
      ),
    )
    .orderBy(desc(aiUsageEvents.createdAt))
  // The latest draft_used of a new chapter (priorChars 0) is the draft the chapter came from.
  const event = used.find((row) => row.extra.priorChars === 0)
  if (!event || !event.runId) return

  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, event.runId)).limit(1)
  if (!run || run.workId !== workId) return
  const aiText = draftTextOf(run.output)
  if (aiText === null) return
  if (aiText.length > MAX_RATIO_CHARS || body.length > MAX_RATIO_CHARS) return

  const { inserted, deleted } = diffStats(diffTexts(aiText, body, 'words'))
  const value = (inserted + deleted) / Math.max(1, aiText.length)
  const extra = { aiChars: aiText.length, bodyChars: body.length }

  const [existing] = await db
    .select({ id: aiUsageEvents.id })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workId, workId),
        eq(aiUsageEvents.chapterId, chapterId),
        eq(aiUsageEvents.kind, 'draft_edit_ratio'),
      ),
    )
    .limit(1)
  if (existing) {
    await db.update(aiUsageEvents).set({ value, extra }).where(eq(aiUsageEvents.id, existing.id))
    return
  }
  await db.insert(aiUsageEvents).values({
    workId: event.workId,
    userId: event.userId,
    chapterId,
    runId: event.runId,
    kind: 'draft_edit_ratio',
    value,
    extra,
  })
}

function draftTextOf(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'text' in output) {
    const text = (output as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return null
}
