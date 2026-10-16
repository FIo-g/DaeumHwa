'use server'

import { z } from 'zod'
import { SCHEDULE_KINDS, type ScheduleItemRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  createScheduleItem,
  deleteScheduleItem,
  setScheduleItemDone,
  updateScheduleItem,
} from '@/server/schedule'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const CreateScheduleSchema = z.object({
  workId: z.uuid(),
  kind: z.enum(SCHEDULE_KINDS),
  title: z.string().max(100).default(''),
  date: DateSchema,
  endDate: DateSchema.nullable().optional(),
  chapterId: z.uuid().nullable().optional(),
  note: z.string().max(1000).optional(),
})

const UpdateScheduleSchema = z.object({
  itemId: z.uuid(),
  kind: z.enum(SCHEDULE_KINDS).optional(),
  title: z.string().max(100).optional(),
  date: DateSchema.optional(),
  endDate: DateSchema.nullable().optional(),
  chapterId: z.uuid().nullable().optional(),
  note: z.string().max(1000).optional(),
})

const DeleteScheduleSchema = z.object({
  itemId: z.uuid(),
})

const SetDoneSchema = z.object({
  itemId: z.uuid(),
  done: z.boolean(),
})

export async function createScheduleItemAction(
  input: unknown,
): Promise<ActionResult<ScheduleItemRow>> {
  return withAction(async (db, actor) => {
    const data = CreateScheduleSchema.parse(input)
    const item = await createScheduleItem(db, actor, data)
    revalidateWork(item.workId)
    return item
  })
}

export async function updateScheduleItemAction(
  input: unknown,
): Promise<ActionResult<ScheduleItemRow>> {
  return withAction(async (db, actor) => {
    const { itemId, ...patch } = UpdateScheduleSchema.parse(input)
    const item = await updateScheduleItem(db, actor, itemId, patch)
    revalidateWork(item.workId)
    return item
  })
}

export async function deleteScheduleItemAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const { itemId } = DeleteScheduleSchema.parse(input)
    const workId = await requireRowWork(db, 'schedule_items', itemId)
    await deleteScheduleItem(db, actor, itemId)
    revalidateWork(workId)
  })
}

export async function setScheduleItemDoneAction(
  input: unknown,
): Promise<ActionResult<ScheduleItemRow>> {
  return withAction(async (db, actor) => {
    const { itemId, done } = SetDoneSchema.parse(input)
    const item = await setScheduleItemDone(db, actor, { itemId, done })
    revalidateWork(item.workId)
    return item
  })
}
