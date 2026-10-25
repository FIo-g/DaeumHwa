'use server'

import { z } from 'zod'
import { DraftPlanCardSchema } from '@/ai/tasks/draft-plan'
import type { ChapterRow } from '@/db/types'
import type { DirectiveFinding } from '@/lib/directive-check'
import type { DirectiveForPrompt } from '@/lib/directives'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  createChapterFromDraft,
  draftDirectiveFindings,
  planDraft,
  type RepairDraftResult,
  repairDraft,
  runReaderSimulation,
} from '@/server/ai-features'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import type { AppliedRefinement } from '@/lib/draft-refine'
import type { DraftPlanCard } from '@/lib/draft-plan'
import type { ActionResult } from '@/lib/result'
import { applyDraftRefinement } from '@/server/draft-refine'
import { applySceneFix, discardSceneFix } from '@/server/draft-check'
import { recordDraftUse } from '@/server/usage-events'

const ReaderSimulationSchema = z.object({
  chapterId: z.uuid(),
  personaIds: z.array(z.string().min(1).max(50)).max(4).optional(),
})

const CreateChapterFromDraftSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
  title: z.string().max(200).optional(),
})

const RepairDraftSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
})

export const PlanDraftSchema = z.object({
  workId: z.uuid(),
  chapterId: z.uuid().nullish(),
  instructions: z.string().max(5000),
  targetChars: z.number().int().min(500).max(20000).optional(),
  entryIds: z.array(z.uuid()).max(50),
  revision: z
    .object({
      card: DraftPlanCardSchema,
      note: z.string().trim().min(1).max(300),
      earlierNotes: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
    })
    .optional(),
})

const RecordDraftUseSchema = z.object({
  workId: z.uuid(),
  chapterId: z.uuid(),
  runId: z.uuid(),
  priorChars: z.number().int().min(0),
})

const ApplyDraftRefinementSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
  token: z.string(),
})

export async function runReaderSimulationAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; result: ReaderSimResult }>> {
  return withAction(async (db, actor) => {
    const data = ReaderSimulationSchema.parse(input)
    const workId = await requireRowWork(db, 'chapters', data.chapterId)
    const out = await runReaderSimulation(db, actor, data)
    revalidateWork(workId)
    return out
  })
}

export async function createChapterFromDraftAction(
  input: unknown,
): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const data = CreateChapterFromDraftSchema.parse(input)
    const chapter = await createChapterFromDraft(db, actor, data)
    revalidateWork(data.workId)
    return chapter
  })
}

export async function repairDraftAction(input: unknown): Promise<ActionResult<RepairDraftResult>> {
  return withAction(async (db, actor) => {
    const data = RepairDraftSchema.parse(input)
    const result = await repairDraft(db, actor, data)
    revalidateWork(data.workId)
    return result
  })
}

const DraftFindingsSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
})

/** The request findings of a finished draft run, for the draft panel. */
export async function draftFindingsAction(input: unknown): Promise<
  ActionResult<{
    findings: DirectiveFinding[]
    directives: DirectiveForPrompt[]
  }>
> {
  return withAction(async (db, actor) => {
    const data = DraftFindingsSchema.parse(input)
    return draftDirectiveFindings(db, actor, data.workId, data.runId)
  })
}

/** Counts one draft use (numbers only). The panel calls it when the author appends a draft. */
export async function recordDraftUseAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const data = RecordDraftUseSchema.parse(input)
    await recordDraftUse(db, actor, data)
  })
}

export async function applyDraftRefinementAction(
  input: unknown,
): Promise<ActionResult<AppliedRefinement>> {
  return withAction(async (db, actor) => {
    const data = ApplyDraftRefinementSchema.parse(input)
    const applied = await applyDraftRefinement(db, actor, data)
    revalidateWork(data.workId)
    return applied
  })
}

const SceneFixActionSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
  token: z.string(),
})

export async function applySceneFixAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; text: string }>> {
  return withAction(async (db, actor) => {
    const data = SceneFixActionSchema.parse(input)
    const applied = await applySceneFix(db, actor, data)
    revalidateWork(data.workId)
    return applied
  })
}

export async function discardSceneFixAction(
  input: unknown,
): Promise<ActionResult<{ runId: string }>> {
  return withAction(async (db, actor) => {
    const data = SceneFixActionSchema.parse(input)
    const discarded = await discardSceneFix(db, actor, data)
    revalidateWork(data.workId)
    return discarded
  })
}

/** Proposes a chapter plan card. Nothing is written; the card lives in the run output. Editor role. */
export async function planDraftAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; card: DraftPlanCard; warnings: string[] }>> {
  return withAction(async (db, actor) => {
    const data = PlanDraftSchema.parse(input)
    return planDraft(db, actor, data)
  })
}
