'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/result'
import type { WorkRow } from '@/db/types'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { createWork, setWorkArchived, updateWork } from '@/server/works'

const SettingsSchema = z.object({
  absenceThreshold: z.number().int().min(1).max(100).optional(),
  publishDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  chaptersPerPublishDay: z.number().int().min(1).max(10).optional(),
  bufferTarget: z.number().int().min(0).max(100).optional(),
  targetChars: z.number().int().min(500).max(20000).optional(),
})

const CreateWorkSchema = z.object({
  title: z.string().trim().min(1).max(100),
  genre: z.string().max(50).optional(),
  logline: z.string().max(200).optional(),
})

const UpdateWorkSchema = z.object({
  workId: z.uuid(),
  title: z.string().trim().min(1).max(100).optional(),
  genre: z.string().max(50).optional(),
  logline: z.string().max(200).optional(),
  synopsis: z.string().max(2000).optional(),
  settings: SettingsSchema.optional(),
})

const SetArchivedSchema = z.object({
  workId: z.uuid(),
  archived: z.boolean(),
})

export async function createWorkAction(input: unknown): Promise<ActionResult<WorkRow>> {
  return withAction(async (db, actor) => {
    const data = CreateWorkSchema.parse(input)
    const work = await createWork(db, actor, data)
    revalidateWork(work.id)
    return work
  })
}

export async function updateWorkAction(input: unknown): Promise<ActionResult<WorkRow>> {
  return withAction(async (db, actor) => {
    const { workId, ...patch } = UpdateWorkSchema.parse(input)
    const work = await updateWork(db, actor, workId, patch)
    revalidateWork(workId)
    return work
  })
}

export async function setWorkArchivedAction(input: unknown): Promise<ActionResult<WorkRow>> {
  return withAction(async (db, actor) => {
    const { workId, archived } = SetArchivedSchema.parse(input)
    const work = await setWorkArchived(db, actor, workId, archived)
    revalidateWork(workId)
    return work
  })
}
