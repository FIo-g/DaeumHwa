import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { replaceRunOutput, runAiTask } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import {
  DirectiveInferSchema,
  directiveInferTask,
  type DirectiveInferProposal,
} from '@/ai/tasks/directive-infer'
import type { Db } from '@/db/client'
import { aiRuns, aiUsageEvents, chapters, wikiEntries } from '@/db/schema'
import type { Actor, DirectiveKind } from '@/db/types'
import { type DirectiveForPrompt } from '@/lib/directives'
import { editHunks } from '@/lib/edit-hunks'
import { AppError } from '@/lib/errors'
import { requireWorkRole } from '@/server/access'
import { createDirective, listDirectives } from '@/server/directives'
import { recordUsageEvent } from '@/server/usage-events'

// Lasting requests inferred from the author's edits to an AI draft (stage 4, task 2). The
// inference only ever sees edit hunks, never the whole chapter. A proposal becomes a ledger row
// only when the author presses add, through createDirective with source 'inferred'.

/** The inference runs only for a done chapter whose edit ratio reaches this share. */
const MIN_EDIT_RATIO = 0.05

/** Undecided proposals kept in the run output, newest runs first. */
const MAX_LIST_PROPOSALS = 10

/** A running inference older than this is treated as abandoned, as run.ts does. */
const RUNNING_STALE_MS = 10 * 60 * 1000

export type InferredProposal = {
  runId: string
  /** Position of the proposal in its run's output. */
  index: number
  text: string
  kind: DirectiveKind
  entryId: string | null
  entryName: string | null
  pattern: string | null
}

const StoredInferSchema = DirectiveInferSchema.and(
  z.object({ decided: z.record(z.string(), z.enum(['added', 'ignored'])).optional() }),
)

type StoredInfer = {
  proposals: DirectiveInferProposal[]
  decided: Record<string, 'added' | 'ignored'>
}

function readStored(output: unknown): StoredInfer {
  const parsed = StoredInferSchema.safeParse(output)
  if (!parsed.success) return { proposals: [], decided: {} }
  return { proposals: parsed.data.proposals, decided: parsed.data.decided ?? {} }
}

type CharacterEntry = { id: string; name: string; aliases: string[] }

async function characterEntries(db: Db, workId: string): Promise<CharacterEntry[]> {
  return db
    .select({ id: wikiEntries.id, name: wikiEntries.name, aliases: wikiEntries.aliases })
    .from(wikiEntries)
    .where(
      and(
        eq(wikiEntries.workId, workId),
        eq(wikiEntries.kind, 'character'),
        isNull(wikiEntries.archivedAt),
      ),
    )
}

function resolveEntry(name: string, entries: CharacterEntry[]): CharacterEntry | undefined {
  return entries.find((entry) => entry.name === name || entry.aliases.includes(name))
}

function toProposal(
  runId: string,
  index: number,
  proposal: DirectiveInferProposal,
  entries: CharacterEntry[],
): InferredProposal {
  const entryId = proposal.entryName
    ? (resolveEntry(proposal.entryName, entries)?.id ?? null)
    : null
  return {
    runId,
    index,
    text: proposal.text,
    kind: proposal.kind,
    entryId,
    entryName: proposal.entryName,
    pattern: proposal.pattern,
  }
}

function undecided(
  runId: string,
  stored: StoredInfer,
  entries: CharacterEntry[],
): InferredProposal[] {
  return stored.proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(({ index }) => stored.decided[String(index)] === undefined)
    .map(({ proposal, index }) => toProposal(runId, index, proposal, entries))
}

/**
 * Infers lasting requests from the author's edits to the AI draft of a done chapter. Editor.
 * Runs only when the chapter is done, has a draft_used event with priorChars 0 whose run text
 * is available, and its draft_edit_ratio reaches 0.05. A chapter with an earlier directive-infer
 * run returns that run's undecided proposals without a new call. Returns a null runId and no
 * proposals when the inference does not run.
 */
export async function inferDirectives(
  db: Db,
  actor: Actor,
  input: { workId: string; chapterId: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ runId: string | null; proposals: InferredProposal[] }> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, input.chapterId))
    .limit(1)
  if (!chapter || chapter.workId !== input.workId || chapter.archivedAt) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (chapter.status !== 'done') return { runId: null, proposals: [] }

  const entries = await characterEntries(db, input.workId)

  const [earlier] = await db
    .select()
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.workId, input.workId),
        eq(aiRuns.chapterId, input.chapterId),
        eq(aiRuns.task, 'directive-infer'),
        eq(aiRuns.status, 'done'),
      ),
    )
    .orderBy(desc(aiRuns.createdAt))
    .limit(1)
  if (earlier) {
    return {
      runId: earlier.id,
      proposals: undecided(earlier.id, readStored(earlier.output), entries),
    }
  }

  const [running] = await db
    .select({ id: aiRuns.id })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.workId, input.workId),
        eq(aiRuns.chapterId, input.chapterId),
        eq(aiRuns.task, 'directive-infer'),
        eq(aiRuns.status, 'running'),
        gte(aiRuns.createdAt, new Date(Date.now() - RUNNING_STALE_MS)),
      ),
    )
    .limit(1)
  if (running) return { runId: null, proposals: [] }

  const used = await db
    .select()
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workId, input.workId),
        eq(aiUsageEvents.chapterId, input.chapterId),
        eq(aiUsageEvents.kind, 'draft_used'),
      ),
    )
    .orderBy(desc(aiUsageEvents.createdAt))
  const event = used.find((row) => row.extra.priorChars === 0)
  if (!event || !event.runId) return { runId: null, proposals: [] }

  const [draftRun] = await db.select().from(aiRuns).where(eq(aiRuns.id, event.runId)).limit(1)
  const aiText =
    draftRun &&
    draftRun.workId === input.workId &&
    typeof draftRun.output === 'object' &&
    draftRun.output !== null &&
    'text' in draftRun.output &&
    typeof (draftRun.output as { text: unknown }).text === 'string'
      ? (draftRun.output as { text: string }).text
      : null
  if (aiText === null) return { runId: null, proposals: [] }

  const [ratio] = await db
    .select()
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workId, input.workId),
        eq(aiUsageEvents.chapterId, input.chapterId),
        eq(aiUsageEvents.kind, 'draft_edit_ratio'),
      ),
    )
    .limit(1)
  if (!ratio || ratio.value < MIN_EDIT_RATIO) return { runId: null, proposals: [] }

  const hunks = editHunks(aiText, chapter.body)
  if (hunks.length === 0) return { runId: null, proposals: [] }

  const rows = await listDirectives(db, actor, input.workId)
  const requests: DirectiveForPrompt[] = rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    text: row.text,
    pattern: row.pattern,
    speechLevel: row.speechLevel,
    targetChars: row.targetChars,
    chapterPosition: row.chapterPosition,
    entryId: row.entryId,
    entryName: row.entryName,
  }))
  const names = entries.flatMap((entry) => [entry.name, ...entry.aliases])

  const { output, runId } = await runAiTask(
    db,
    { userId: actor.userId, workId: input.workId, chapterId: input.chapterId, signal },
    directiveInferTask,
    { hunks, requests, names },
    client,
  )
  const stored: StoredInfer = { proposals: output.proposals, decided: {} }
  await replaceRunOutput(db, runId, stored)
  try {
    await recordUsageEvent(db, actor, {
      workId: input.workId,
      chapterId: input.chapterId,
      runId,
      kind: 'directive_inferred',
      value: output.proposals.length,
    })
  } catch (error) {
    console.warn('usage event directive_inferred failed', error)
  }
  return { runId, proposals: undecided(runId, stored, entries) }
}

/** Undecided proposals of the work's directive-infer runs, newest first, at most 10. Viewer. */
export async function listInferredProposals(
  db: Db,
  actor: Actor,
  workId: string,
  o: { chapterId?: string } = {},
): Promise<InferredProposal[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [
    eq(aiRuns.workId, workId),
    eq(aiRuns.task, 'directive-infer'),
    eq(aiRuns.status, 'done'),
  ]
  if (o.chapterId) conditions.push(eq(aiRuns.chapterId, o.chapterId))
  const runs = await db
    .select()
    .from(aiRuns)
    .where(and(...conditions))
    .orderBy(desc(aiRuns.createdAt))
    .limit(20)
  const entries = await characterEntries(db, workId)
  const out: InferredProposal[] = []
  for (const run of runs) {
    for (const proposal of undecided(run.id, readStored(run.output), entries)) {
      out.push(proposal)
      if (out.length >= MAX_LIST_PROPOSALS) return out
    }
  }
  return out
}

/**
 * Decides one inferred proposal. Editor. `add` writes a ledger row with source 'inferred'
 * (character scope when the proposal names a known entry, else work scope); `ignore` writes
 * nothing. Both mark the proposal decided with a conditional update, so deciding twice throws.
 */
export async function decideInferred(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; index: number; decision: 'add' | 'ignore' },
): Promise<{
  runId: string
  index: number
  decision: 'added' | 'ignored'
  directiveId: string | null
}> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, input.runId)).limit(1)
  if (!run || run.workId !== input.workId || run.task !== 'directive-infer') {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  const stored = readStored(run.output)
  const proposal = stored.proposals[input.index]
  if (!proposal) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  if (stored.decided[String(input.index)] !== undefined) {
    throw new AppError('BAD_STATE', '이미 정한 제안입니다.')
  }

  const decided = input.decision === 'add' ? 'added' : 'ignored'
  const entries = input.decision === 'add' ? await characterEntries(db, input.workId) : []
  const entryId =
    input.decision === 'add' && proposal.entryName
      ? (resolveEntry(proposal.entryName, entries)?.id ?? null)
      : null

  // The decision and the ledger row commit together. The update only matches while the proposal
  // is undecided, so a concurrent decision on the same proposal throws instead of writing twice.
  const directiveId = await db.transaction(async (tx) => {
    const updated = await tx
      .update(aiRuns)
      .set({
        output: sql`jsonb_set(coalesce(${aiRuns.output}, '{}'::jsonb), ${`{decided,${input.index}}`}::text[], ${JSON.stringify(decided)}::jsonb, true)`,
      })
      .where(
        and(
          eq(aiRuns.id, run.id),
          sql`NOT (coalesce(${aiRuns.output}->'decided', '{}'::jsonb) ? ${String(input.index)})`,
        ),
      )
      .returning({ id: aiRuns.id })
    if (updated.length === 0) throw new AppError('BAD_STATE', '이미 정한 제안입니다.')
    if (input.decision === 'ignore') return null
    const created = await createDirective(tx, actor, {
      workId: input.workId,
      scope: entryId ? 'character' : 'work',
      kind: proposal.kind,
      text: proposal.text,
      entryId,
      pattern: proposal.pattern,
      source: 'inferred',
    })
    return created.id
  })

  if (input.decision === 'add') {
    try {
      await recordUsageEvent(db, actor, {
        workId: input.workId,
        chapterId: run.chapterId,
        runId: run.id,
        kind: 'directive_inferred_added',
        value: 1,
      })
    } catch (error) {
      console.warn('usage event directive_inferred_added failed', error)
    }
  }

  return { runId: run.id, index: input.index, decision: decided, directiveId }
}
