'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/result'
import { requireWorkRole } from '@/server/access'
import { type PeriodicAlerts, getPeriodicAlerts } from '@/server/alerts'
import { withAction } from '@/server/action-helpers'

const GetAlertsSchema = z.object({
  workId: z.uuid(),
})

/** Periodic checks for one work. Viewer role or higher (the service itself does not check access). */
export async function getAlertsAction(input: unknown): Promise<ActionResult<PeriodicAlerts>> {
  return withAction(async (db, actor) => {
    const { workId } = GetAlertsSchema.parse(input)
    await requireWorkRole(db, workId, actor.userId, 'viewer')
    return getPeriodicAlerts(db, workId)
  })
}
