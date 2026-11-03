'use server'

import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { createSampleWork } from '@/server/sample-work'

export async function createSampleWorkAction(): Promise<
  ActionResult<{ workId: string; chapterId: string }>
> {
  return withAction(async (db, actor) => {
    const result = await createSampleWork(db, actor)
    revalidateWork(result.workId)
    return result
  })
}
