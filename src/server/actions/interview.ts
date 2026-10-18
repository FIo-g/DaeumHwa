'use server'

import { z } from 'zod'
import type { InterviewSessionRow, InterviewTurnRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { completeInterview, skipTurn, startInterview } from '@/server/interview'

// Question and answer calls run through route handlers (see app/api/works/[workId]/interview).

const WorkIdSchema = z.object({ workId: z.uuid() })
const SessionIdSchema = z.object({ sessionId: z.uuid() })
const TurnIdSchema = z.object({ turnId: z.uuid() })

export async function startInterviewAction(
  input: unknown,
): Promise<ActionResult<InterviewSessionRow>> {
  return withAction(async (db, actor) => {
    const { workId } = WorkIdSchema.parse(input)
    const session = await startInterview(db, actor, workId)
    revalidateWork(workId)
    return session
  })
}

export async function skipTurnAction(input: unknown): Promise<ActionResult<InterviewTurnRow>> {
  return withAction(async (db, actor) => {
    const { turnId } = TurnIdSchema.parse(input)
    const workId = await requireRowWork(db, 'interview_turns', turnId)
    const turn = await skipTurn(db, actor, turnId)
    revalidateWork(workId)
    return turn
  })
}

export async function completeInterviewAction(
  input: unknown,
): Promise<ActionResult<InterviewSessionRow>> {
  return withAction(async (db, actor) => {
    const { sessionId } = SessionIdSchema.parse(input)
    const workId = await requireRowWork(db, 'interview_sessions', sessionId)
    const session = await completeInterview(db, actor, sessionId)
    revalidateWork(workId)
    return session
  })
}
