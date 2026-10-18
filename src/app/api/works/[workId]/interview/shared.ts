import { z } from 'zod'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { requireRowWork } from '@/server/access'

// Body schemas and the row check shared by the interview route handlers.

export const ANSWER_MAX_LENGTH = 5000

export const NextBodySchema = z.object({ sessionId: z.uuid() })

export const AnswerBodySchema = z.object({
  turnId: z.uuid(),
  answer: z.string().max(ANSWER_MAX_LENGTH),
})

/** Throws NOT_FOUND unless the session or turn belongs to the work in the path. */
export async function assertRowInWork(
  db: Db,
  table: 'interview_sessions' | 'interview_turns',
  id: string,
  workId: string,
): Promise<void> {
  const rowWork = await requireRowWork(db, table, id)
  if (rowWork !== workId) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
}
