'use server'

import { z } from 'zod'
import { CHANGE_TARGETS, PROPOSER_TYPES } from '@/db/types'
import type { ChangeRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { listChanges, revertChange } from '@/server/changes'

const RevertChangeSchema = z.object({
  changeId: z.uuid(),
})

const ListChangesSchema = z.object({
  workId: z.uuid(),
  targetTable: z.enum(CHANGE_TARGETS).optional(),
  proposerType: z.enum(PROPOSER_TYPES).optional(),
  beforeCreatedAt: z.iso.datetime().optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export async function revertChangeAction(input: unknown): Promise<ActionResult<ChangeRow>> {
  return withAction(async (db, actor) => {
    const data = RevertChangeSchema.parse(input)
    const change = await revertChange(db, actor, data.changeId)
    revalidateWork(change.workId)
    return change
  })
}

export async function listChangesAction(
  input: unknown,
): Promise<ActionResult<(ChangeRow & { actorName: string | null })[]>> {
  return withAction(async (db, actor) => {
    const { workId, beforeCreatedAt, ...filter } = ListChangesSchema.parse(input)
    return listChanges(db, actor, workId, {
      ...filter,
      beforeCreatedAt: beforeCreatedAt ? new Date(beforeCreatedAt) : undefined,
    })
  })
}
