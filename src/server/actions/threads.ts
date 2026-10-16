'use server'

import { z } from 'zod'
import { IMPORTANCE, THREAD_EVENT_KINDS } from '@/db/types'
import type { ThreadEventRow, ThreadRow } from '@/db/types'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import type { ActionResult } from '@/lib/result'
import {
  addThreadEvent,
  archiveThread,
  archiveThreadEvent,
  createThread,
  updateThread,
} from '@/server/threads'

const CreateThreadSchema = z.object({
  workId: z.uuid(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000).optional(),
  status: z.enum(['planned', 'planted']),
  plantedChapterId: z.uuid().nullable().optional(),
  targetChapterPosition: z.number().int().min(1).max(10000).nullable().optional(),
  importance: z.enum(IMPORTANCE).optional(),
  relatedEntryIds: z.array(z.uuid()).max(50).optional(),
})

const UpdateThreadSchema = z.object({
  threadId: z.uuid(),
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  targetChapterPosition: z.number().int().min(1).max(10000).nullable().optional(),
  importance: z.enum(IMPORTANCE).optional(),
  relatedEntryIds: z.array(z.uuid()).max(50).optional(),
})

const AddThreadEventSchema = z.object({
  threadId: z.uuid(),
  kind: z.enum(THREAD_EVENT_KINDS),
  chapterId: z.uuid().nullable().optional(),
  note: z.string().max(2000).optional(),
  evidence: z.string().max(2000).optional(),
})

const ArchiveThreadSchema = z.object({ threadId: z.uuid() })
const ArchiveThreadEventSchema = z.object({ eventId: z.uuid() })

export async function createThreadAction(input: unknown): Promise<ActionResult<ThreadRow>> {
  return withAction(async (db, actor) => {
    const data = CreateThreadSchema.parse(input)
    const thread = await createThread(db, actor, data)
    revalidateWork(thread.workId)
    return thread
  })
}

export async function updateThreadAction(input: unknown): Promise<ActionResult<ThreadRow>> {
  return withAction(async (db, actor) => {
    const { threadId, ...patch } = UpdateThreadSchema.parse(input)
    const thread = await updateThread(db, actor, threadId, patch)
    revalidateWork(thread.workId)
    return thread
  })
}

export async function addThreadEventAction(input: unknown): Promise<ActionResult<ThreadEventRow>> {
  return withAction(async (db, actor) => {
    const data = AddThreadEventSchema.parse(input)
    const workId = await requireRowWork(db, 'threads', data.threadId)
    const event = await addThreadEvent(db, actor, data)
    revalidateWork(workId)
    return event
  })
}

export async function archiveThreadAction(input: unknown): Promise<ActionResult<ThreadRow>> {
  return withAction(async (db, actor) => {
    const { threadId } = ArchiveThreadSchema.parse(input)
    const thread = await archiveThread(db, actor, threadId)
    revalidateWork(thread.workId)
    return thread
  })
}

export async function archiveThreadEventAction(
  input: unknown,
): Promise<ActionResult<ThreadEventRow>> {
  return withAction(async (db, actor) => {
    const { eventId } = ArchiveThreadEventSchema.parse(input)
    const workId = await requireRowWork(db, 'thread_events', eventId)
    const event = await archiveThreadEvent(db, actor, eventId)
    revalidateWork(workId)
    return event
  })
}
