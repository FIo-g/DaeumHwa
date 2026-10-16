import { and, asc, desc, eq, isNull, notInArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { interviewSessions, interviewTurns, threads, wikiEntries, works } from '@/db/schema'
import {
  type Actor,
  ENTRY_KINDS,
  type EntryKind,
  type InterviewSessionRow,
  type InterviewTurnRow,
  type ProposalRow,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { runAiTask } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import { extractionToProposals, type ExtractionContext } from '@/ai/extraction'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { insertProposals } from '@/server/proposal-store'

// F1 interview service. Questions and answers are stored as interview_sessions / interview_turns.
// Answers go through the AI extraction task and become pending proposals (source 'interview').
// Nothing here writes wiki tables; approval happens later through the proposal engine.

const HISTORY_LIMIT = 10
const ENTRY_NAME_LIMIT = 80
const THREAD_TITLE_LIMIT = 30
const ENDED_MESSAGE = '이미 끝난 인터뷰입니다.'

export type InterviewState = {
  session: InterviewSessionRow | null
  turns: InterviewTurnRow[]
  current: InterviewTurnRow | null
}

type ActiveEntry = { id: string; name: string; aliases: string[]; kind: EntryKind }

/** The active interview of a work with its turns, and the turn waiting for an answer. Any viewer. */
export async function getInterviewState(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<InterviewState> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const session = await findActiveSession(db, workId)
  if (!session) return { session: null, turns: [], current: null }
  const turns = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, session.id))
    .orderBy(asc(interviewTurns.createdAt))
  return { session, turns, current: findOpenTurn(turns) }
}

/** Returns the active interview, or creates one. Editors and above. */
export async function startInterview(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<InterviewSessionRow> {
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const existing = await findActiveSession(db, workId)
  if (existing) return existing
  const [session] = await db
    .insert(interviewSessions)
    .values({ workId, createdBy: actor.userId })
    .returning()
  return session
}

/**
 * Asks the next question. If a question is still waiting for an answer, that one is returned
 * instead of calling the AI again. Editors and above.
 */
export async function askNextQuestion(
  db: Db,
  actor: Actor,
  sessionId: string,
  client?: AiClient,
): Promise<InterviewTurnRow> {
  const workId = await requireRowWork(db, 'interview_sessions', sessionId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const session = await loadSession(db, sessionId)
  if (session.status !== 'active') throw new AppError('BAD_STATE', ENDED_MESSAGE)

  const open = await findOpenTurnInSession(db, sessionId)
  if (open) return open

  const input = await buildQuestionInput(db, workId, sessionId)
  const { output } = await runAiTask(
    db,
    { userId: actor.userId, workId },
    interviewQuestionTask,
    input,
    client,
  )
  const [turn] = await db
    .insert(interviewTurns)
    .values({
      sessionId,
      topic: output.topic,
      question: output.question,
      rationale: output.rationale,
    })
    .returning()
  return turn
}

/**
 * Stores the answer, runs extraction and saves the candidates as pending proposals. The answer
 * and the proposals commit together. Editors and above.
 */
export async function answerTurn(
  db: Db,
  actor: Actor,
  input: { turnId: string; answer: string },
  client?: AiClient,
): Promise<{ turn: InterviewTurnRow; proposals: ProposalRow[] }> {
  const answer = input.answer.trim()
  if (!answer) throw new AppError('VALIDATION', '답을 입력하거나 건너뛰기를 누르세요.')

  const workId = await requireRowWork(db, 'interview_turns', input.turnId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const turn = await loadTurn(db, input.turnId)
  await assertTurnOpen(db, turn)

  const entries = await loadActiveEntries(db, workId)
  const { output } = await runAiTask(
    db,
    { userId: actor.userId, workId },
    interviewExtractTask,
    {
      topic: turn.topic,
      question: turn.question,
      answer,
      known: entries.map((e) => ({ name: e.name, kind: e.kind, aliases: e.aliases })),
    },
    client,
  )

  const context: ExtractionContext = {
    source: 'interview',
    sourceRef: turn.id,
    chapterId: null,
    chapterPosition: null,
    existingEntries: entries,
    threadRefs: new Map(),
    factRefs: new Map(),
  }
  const { proposals: items } = extractionToProposals(output, context)

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(interviewTurns)
      .set({ answer, answeredAt: new Date(), proposalCount: items.length })
      .where(
        and(
          eq(interviewTurns.id, turn.id),
          isNull(interviewTurns.answer),
          eq(interviewTurns.skipped, false),
        ),
      )
      .returning()
    if (!updated) throw new AppError('CONFLICT', '이미 답한 질문입니다.')
    const proposals = await insertProposals(tx, workId, items)
    return { turn: updated, proposals }
  })
}

/** Skips an unanswered question. The next question avoids its topic. Editors and above. */
export async function skipTurn(db: Db, actor: Actor, turnId: string): Promise<InterviewTurnRow> {
  const workId = await requireRowWork(db, 'interview_turns', turnId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const turn = await loadTurn(db, turnId)
  await assertTurnOpen(db, turn)

  const [updated] = await db
    .update(interviewTurns)
    .set({ skipped: true })
    .where(
      and(
        eq(interviewTurns.id, turn.id),
        isNull(interviewTurns.answer),
        eq(interviewTurns.skipped, false),
      ),
    )
    .returning()
  if (!updated) throw new AppError('CONFLICT', '이미 답하거나 건너뛴 질문입니다.')
  return updated
}

/** Ends the active interview. Its turns stay stored. Editors and above. */
export async function completeInterview(
  db: Db,
  actor: Actor,
  sessionId: string,
): Promise<InterviewSessionRow> {
  const workId = await requireRowWork(db, 'interview_sessions', sessionId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const session = await loadSession(db, sessionId)
  if (session.status !== 'active') throw new AppError('BAD_STATE', ENDED_MESSAGE)

  const [updated] = await db
    .update(interviewSessions)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(interviewSessions.id, sessionId))
    .returning()
  return updated
}

// ---- helpers ----

async function findActiveSession(db: Db, workId: string): Promise<InterviewSessionRow | null> {
  const [row] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.workId, workId), eq(interviewSessions.status, 'active')))
    .orderBy(desc(interviewSessions.createdAt))
    .limit(1)
  return row ?? null
}

async function loadSession(db: Db, sessionId: string): Promise<InterviewSessionRow> {
  const [row] = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

async function loadTurn(db: Db, turnId: string): Promise<InterviewTurnRow> {
  const [row] = await db.select().from(interviewTurns).where(eq(interviewTurns.id, turnId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

/** Throws unless the turn can still take an answer or a skip. */
async function assertTurnOpen(db: Db, turn: InterviewTurnRow): Promise<void> {
  const session = await loadSession(db, turn.sessionId)
  if (session.status !== 'active') throw new AppError('BAD_STATE', ENDED_MESSAGE)
  if (turn.answer !== null) throw new AppError('CONFLICT', '이미 답한 질문입니다.')
  if (turn.skipped) throw new AppError('CONFLICT', '이미 건너뛴 질문입니다.')
}

/** The last turn with no answer that was not skipped. */
function findOpenTurn(turns: InterviewTurnRow[]): InterviewTurnRow | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.answer === null && !turn.skipped) return turn
  }
  return null
}

async function findOpenTurnInSession(db: Db, sessionId: string): Promise<InterviewTurnRow | null> {
  const [row] = await db
    .select()
    .from(interviewTurns)
    .where(
      and(
        eq(interviewTurns.sessionId, sessionId),
        isNull(interviewTurns.answer),
        eq(interviewTurns.skipped, false),
      ),
    )
    .orderBy(desc(interviewTurns.createdAt))
    .limit(1)
  return row ?? null
}

/** Non-archived entry cards of a work (name, kind and aliases). */
async function loadActiveEntries(db: Db, workId: string): Promise<ActiveEntry[]> {
  const rows = await db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      aliases: wikiEntries.aliases,
      kind: wikiEntries.kind,
    })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.createdAt))
  return rows
}

/** Input for the question task: work pitch, wiki summary and the last few answered or skipped turns. */
async function buildQuestionInput(db: Db, workId: string, sessionId: string) {
  const [work] = await db.select().from(works).where(eq(works.id, workId)).limit(1)
  if (!work) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')

  const entries = await loadActiveEntries(db, workId)
  const counts = Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, 0])) as Record<
    EntryKind,
    number
  >
  for (const entry of entries) counts[entry.kind] += 1

  const openThreads = await db
    .select({ title: threads.title })
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        notInArray(threads.status, ['resolved', 'discarded']),
      ),
    )
    .orderBy(asc(threads.createdAt))
    .limit(THREAD_TITLE_LIMIT)

  const turns = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, sessionId))
    .orderBy(asc(interviewTurns.createdAt))
  const history = turns
    .filter((turn) => turn.skipped || turn.answer !== null)
    .slice(-HISTORY_LIMIT)
    .map((turn) => ({
      topic: turn.topic,
      question: turn.question,
      answer: turn.answer,
      skipped: turn.skipped,
    }))

  return {
    work: {
      title: work.title,
      genre: work.genre,
      logline: work.logline,
      synopsis: work.synopsis,
    },
    wiki: {
      counts,
      entryNames: entries.slice(0, ENTRY_NAME_LIMIT).map((e) => e.name),
      openThreadTitles: openThreads.map((t) => t.title),
    },
    history,
  }
}
