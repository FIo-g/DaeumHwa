'use server'

import { z } from 'zod'
import type { ImportJobRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  appendImportChapters,
  cancelImportJob,
  createImportJob,
  pauseImportJob,
  startImportJob,
} from '@/server/imports'

// Count limits (2000 chapters, 50 per upload) are checked by the service so the user sees the
// Korean message, not a generic zod failure.

const CreateSchema = z.object({
  workId: z.uuid(),
  fileName: z.string().max(255),
  totalChapters: z.number().int(),
})

const AppendSchema = z.object({
  jobId: z.uuid(),
  chapters: z.array(z.object({ title: z.string().max(200), body: z.string() })),
})

const JobIdSchema = z.object({ jobId: z.uuid() })

export async function createImportJobAction(input: unknown): Promise<ActionResult<ImportJobRow>> {
  return withAction(async (db, actor) => {
    const data = CreateSchema.parse(input)
    const job = await createImportJob(db, actor, data)
    revalidateWork(data.workId)
    return job
  })
}

export async function appendImportChaptersAction(
  input: unknown,
): Promise<ActionResult<{ appended: number; received: number }>> {
  return withAction(async (db, actor) => {
    const data = AppendSchema.parse(input)
    const workId = await requireRowWork(db, 'import_jobs', data.jobId)
    const result = await appendImportChapters(db, actor, data)
    revalidateWork(workId)
    return result
  })
}

export async function startImportJobAction(input: unknown): Promise<ActionResult<ImportJobRow>> {
  return withAction(async (db, actor) => {
    const { jobId } = JobIdSchema.parse(input)
    const workId = await requireRowWork(db, 'import_jobs', jobId)
    const job = await startImportJob(db, actor, jobId)
    revalidateWork(workId)
    return job
  })
}

export async function pauseImportJobAction(input: unknown): Promise<ActionResult<ImportJobRow>> {
  return withAction(async (db, actor) => {
    const { jobId } = JobIdSchema.parse(input)
    const workId = await requireRowWork(db, 'import_jobs', jobId)
    const job = await pauseImportJob(db, actor, jobId)
    revalidateWork(workId)
    return job
  })
}

export async function cancelImportJobAction(input: unknown): Promise<ActionResult<ImportJobRow>> {
  return withAction(async (db, actor) => {
    const { jobId } = JobIdSchema.parse(input)
    const workId = await requireRowWork(db, 'import_jobs', jobId)
    const job = await cancelImportJob(db, actor, jobId)
    revalidateWork(workId)
    return job
  })
}
