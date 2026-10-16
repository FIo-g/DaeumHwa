'use server'

import { z } from 'zod'
import type { RelationRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { archiveRelation, createRelation, updateRelation } from '@/server/relations'

const RelationPositionSchema = z.number().int().min(1).max(10000).nullable().optional()

const CreateRelationSchema = z.object({
  workId: z.uuid(),
  sourceEntryId: z.uuid(),
  targetEntryId: z.uuid(),
  kind: z.string().trim().min(1).max(30),
  description: z.string().max(500).optional(),
  directed: z.boolean().optional(),
  startPosition: RelationPositionSchema,
  endPosition: RelationPositionSchema,
})

const UpdateRelationSchema = z.object({
  relationId: z.uuid(),
  sourceEntryId: z.uuid().optional(),
  targetEntryId: z.uuid().optional(),
  kind: z.string().trim().min(1).max(30).optional(),
  description: z.string().max(500).optional(),
  directed: z.boolean().optional(),
  startPosition: RelationPositionSchema,
  endPosition: RelationPositionSchema,
})

const ArchiveRelationSchema = z.object({ relationId: z.uuid() })

export async function createRelationAction(input: unknown): Promise<ActionResult<RelationRow>> {
  return withAction(async (db, actor) => {
    const data = CreateRelationSchema.parse(input)
    const relation = await createRelation(db, actor, data)
    revalidateWork(relation.workId)
    return relation
  })
}

export async function updateRelationAction(input: unknown): Promise<ActionResult<RelationRow>> {
  return withAction(async (db, actor) => {
    const { relationId, ...patch } = UpdateRelationSchema.parse(input)
    const relation = await updateRelation(db, actor, relationId, patch)
    revalidateWork(relation.workId)
    return relation
  })
}

export async function archiveRelationAction(input: unknown): Promise<ActionResult<RelationRow>> {
  return withAction(async (db, actor) => {
    const { relationId } = ArchiveRelationSchema.parse(input)
    const relation = await archiveRelation(db, actor, relationId)
    revalidateWork(relation.workId)
    return relation
  })
}
