'use server'

import { z } from 'zod'
import type { IssueRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { reopenIssue, resolveIssue } from '@/server/issues'

const ResolveIssueSchema = z.object({
  issueId: z.uuid(),
  status: z.enum(['accepted', 'dismissed', 'wiki_updated']),
})

const ReopenIssueSchema = z.object({
  issueId: z.uuid(),
})

export async function resolveIssueAction(input: unknown): Promise<ActionResult<IssueRow>> {
  return withAction(async (db, actor) => {
    const data = ResolveIssueSchema.parse(input)
    const issue = await resolveIssue(db, actor, data)
    revalidateWork(issue.workId)
    return issue
  })
}

export async function reopenIssueAction(input: unknown): Promise<ActionResult<IssueRow>> {
  return withAction(async (db, actor) => {
    const { issueId } = ReopenIssueSchema.parse(input)
    const issue = await reopenIssue(db, actor, issueId)
    revalidateWork(issue.workId)
    return issue
  })
}
