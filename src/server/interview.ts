import { and, asc, desc, eq, isNotNull, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  aiRuns,
  chapters,
  facts,
  interviewSessions,
  interviewTurns,
  issues,
  threads,
  wikiEntries,
  works,
} from '@/db/schema'
import {
  type Actor,
  ENTRY_KINDS,
  type EntryKind,
  type InterviewSessionRow,
  type InterviewTurnRow,
  type ProposalRow,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { runAiTask, throwIfCancelled } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import { extractionToProposals, type ExtractionContext } from '@/ai/extraction'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { isSpeechStyleEnabled } from '@/ai/voice'
import {
  CORE_TOPICS,
  type InterviewQuestionInput,
  interviewQuestionTask,
} from '@/ai/tasks/interview-question'
import { ReaderSimSchema } from '@/ai/tasks/reader-sim'
import { normalizeQuestion, planInterviewTopics, violatesPlan } from '@/lib/interview-plan'
import type { NewProposal } from '@/lib/proposal-payloads'
import { isUndecidedOnlyAnswer } from '@/lib/undecided-answer'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { loadKnownEntries, loadKnownFactTexts } from '@/server/known-entries'
import { insertProposals } from '@/server/proposal-store'

// F1 interview service. Questions and answers are stored as interview_sessions / interview_turns.
// Answers go through the AI extraction task and become pending proposals (source 'interview').
// Nothing here writes wiki tables; approval happens later through the proposal engine.

const COVERED_LIMIT = 120
const COVERED_QUESTION_CHARS = 120
const COVERED_ANSWER_CHARS = 80
const RECENT_LIMIT = 6
const RECENT_ANSWER_CHARS = 600
const ENTRY_LIMIT = 80
const ENTRY_SUMMARY_CHARS = 40
const THREAD_LIMIT = 30
const SUMMARY_LIMIT = 5
const READER_LIMIT = 3
// Known facts sent to the extraction prompt; pending facts come first, so they are kept.
const PROMPT_FACT_LIMIT = 100
const READER_DIGEST_CHARS = 200
const ENDED_MESSAGE = '이미 끝난 인터뷰입니다.'

export type InterviewState = {
  session: InterviewSessionRow | null
  turns: InterviewTurnRow[]
  current: InterviewTurnRow | null
}

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
 * instead of calling the AI again. A question that repeats an earlier one of the work, or asks a
 * topic the plan has closed, is asked once more with the repeated text in `rejected`; a question
 * that breaks the plan again is stored anyway. Editors and above.
 */
export async function askNextQuestion(
  db: Db,
  actor: Actor,
  sessionId: string,
  client?: AiClient,
  signal?: AbortSignal,
): Promise<InterviewTurnRow> {
  const workId = await requireRowWork(db, 'interview_sessions', sessionId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const session = await loadSession(db, sessionId)
  if (session.status !== 'active') throw new AppError('BAD_STATE', ENDED_MESSAGE)

  const open = await findOpenTurnInSession(db, sessionId)
  if (open) return open

  const base = await buildQuestionInput(db, workId, sessionId)
  const meta = { userId: actor.userId, workId, signal }
  let { output } = await runAiTask(
    db,
    meta,
    interviewQuestionTask,
    { ...base, rejected: null },
    client,
  )
  const earlier = await loadQuestionKeys(db, workId)
  if (
    earlier.has(normalizeQuestion(output.question)) ||
    (base.plan !== undefined && violatesPlan(output, base.plan, CORE_TOPICS))
  ) {
    const repeated = output.question
    ;({ output } = await runAiTask(
      db,
      meta,
      interviewQuestionTask,
      { ...base, rejected: repeated },
      client,
    ))
  }

  throwIfCancelled(signal)
  // The partial unique index allows one open question per session. A concurrent ask that lost
  // the race gets the question the other request stored.
  const [turn] = await db
    .insert(interviewTurns)
    .values({
      sessionId,
      focus: output.focus,
      topic: output.topic,
      question: output.question,
      rationale: output.rationale,
    })
    .onConflictDoNothing()
    .returning()
  if (turn) return turn
  const stored = await findOpenTurnInSession(db, sessionId)
  if (!stored) throw new AppError('CONFLICT', '다시 시도해 주세요.')
  return stored
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
  signal?: AbortSignal,
): Promise<{ turn: InterviewTurnRow; proposals: ProposalRow[] }> {
  const answer = input.answer.trim()
  if (!answer) throw new AppError('VALIDATION', '답을 입력하거나 건너뛰기를 누르세요.')

  const workId = await requireRowWork(db, 'interview_turns', input.turnId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const turn = await loadTurn(db, input.turnId)
  await assertTurnOpen(db, turn)

  // An answer that only says the topic is undecided has nothing to extract: no AI call, no proposals.
  let items: NewProposal[] = []
  if (!isUndecidedOnlyAnswer(answer)) {
    const known = await loadKnownEntries(db, workId)
    // Pending facts come first (the loader orders them), so the prompt cap keeps them.
    const factTexts = (await loadKnownFactTexts(db, workId)).map((f) => ({
      ...f,
      subjectName: known.active.find((e) => e.id === f.entryId)?.name ?? f.subjectName,
    }))
    const { output } = await runAiTask(
      db,
      { userId: actor.userId, workId, signal },
      interviewExtractTask,
      {
        topic: turn.topic,
        focus: turn.focus,
        question: turn.question,
        answer,
        known: [
          ...known.active.map((e) => ({
            name: e.name,
            kind: e.kind,
            aliases: e.aliases,
            pending: false,
          })),
          ...known.pending.map((e) => ({
            name: e.name,
            kind: e.kind,
            aliases: e.aliases,
            pending: true,
          })),
        ],
        threads: [
          ...known.threads.map((t) => ({ title: t.title, pending: false })),
          ...known.pendingThreadTitles.map((title) => ({ title, pending: true })),
        ],
        knownFacts: factTexts
          .slice(0, PROMPT_FACT_LIMIT)
          .map(({ subjectName, content, pending }) => ({ subjectName, content, pending })),
      },
      client,
    )

    const pendingTitles = new Set(known.pendingThreadTitles)
    const context: ExtractionContext = {
      source: 'interview',
      sourceRef: turn.id,
      chapterId: null,
      chapterPosition: null,
      existingEntries: known.active,
      pendingEntries: known.pending,
      threadRefs: new Map(),
      factRefs: new Map(),
      existingThreads: known.threads,
      pendingThreadTitles: pendingTitles,
      pendingThreadCreateTitles: pendingTitles,
      sourceText: answer,
      existingFacts: factTexts.map(({ entryId, subjectName, content }) => ({
        entryId,
        subjectName,
        content,
      })),
      speechStyle: isSpeechStyleEnabled(),
      pendingSpeechEntryIds: known.pendingSpeechEntryIds,
    }
    items = extractionToProposals(output, context).proposals
  }

  throwIfCancelled(signal)
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

// Kept exported here so existing callers keep their import; the definition lives in lib.
export { normalizeQuestion }

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

/** Normalized keys of every question the work has asked, across all its sessions. */
async function loadQuestionKeys(db: Db, workId: string): Promise<Set<string>> {
  const rows = await db
    .select({ question: interviewTurns.question })
    .from(interviewTurns)
    .innerJoin(interviewSessions, eq(interviewTurns.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.workId, workId))
  return new Set(rows.map((row) => normalizeQuestion(row.question)))
}

/** The first `max` characters of a text, trimmed. */
function cut(text: string, max: number): string {
  return Array.from(text.trim()).slice(0, max).join('')
}

/** Input for the question task without `rejected`: work, wiki, story, covered and recent turns. */
async function buildQuestionInput(
  db: Db,
  workId: string,
  sessionId: string,
): Promise<Omit<InterviewQuestionInput, 'rejected'>> {
  const [work] = await db.select().from(works).where(eq(works.id, workId)).limit(1)
  if (!work) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')

  const speech = isSpeechStyleEnabled()
  const entries = await db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      kind: wikiEntries.kind,
      summary: wikiEntries.summary,
      fields: wikiEntries.fields,
    })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.createdAt))

  const factCounts = await db
    .select({ entryId: facts.entryId, count: sql<number>`count(*)::int` })
    .from(facts)
    .where(and(eq(facts.workId, workId), isNull(facts.archivedAt), isNotNull(facts.entryId)))
    .groupBy(facts.entryId)
  const factCountByEntry = new Map(factCounts.map((row) => [row.entryId, row.count]))

  const counts = Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, 0])) as Record<
    EntryKind,
    number
  >
  for (const entry of entries) counts[entry.kind] += 1

  const openThreads = await db
    .select({
      title: threads.title,
      targetChapterPosition: threads.targetChapterPosition,
    })
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        notInArray(threads.status, ['resolved', 'discarded']),
      ),
    )
    .orderBy(asc(threads.createdAt))
    .limit(THREAD_LIMIT)

  const [latest] = await db
    .select({ max: sql<number | null>`max(${chapters.position})` })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
  const latestMax = latest?.max
  const latestPosition = latestMax === null || latestMax === undefined ? null : Number(latestMax)

  const summaryRows = await db
    .select({ position: chapters.position, title: chapters.title, summary: chapters.summary })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt), ne(chapters.summary, '')))
    .orderBy(desc(chapters.position))
    .limit(SUMMARY_LIMIT)

  // The newest reader simulation of each chapter, then the latest chapters by position.
  const readerRuns = await db
    .selectDistinctOn([aiRuns.chapterId], {
      output: aiRuns.output,
      position: chapters.position,
    })
    .from(aiRuns)
    .innerJoin(chapters, eq(aiRuns.chapterId, chapters.id))
    .where(
      and(
        eq(aiRuns.workId, workId),
        eq(aiRuns.task, 'reader-sim'),
        eq(aiRuns.status, 'done'),
        isNull(chapters.archivedAt),
      ),
    )
    .orderBy(aiRuns.chapterId, desc(aiRuns.createdAt))
  const readerRows = readerRuns
    .sort((a, b) => b.position - a.position)
    .slice(0, READER_LIMIT)
    .reverse()

  const [openIssues] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(and(eq(issues.workId, workId), eq(issues.status, 'open')))

  // Every question of the work counts as covered, including one left open when its interview
  // ended. An open one has no answer and is not skipped.
  const coveredRows = await db
    .select({
      topic: interviewTurns.topic,
      question: interviewTurns.question,
      answer: interviewTurns.answer,
      skipped: interviewTurns.skipped,
      focus: interviewTurns.focus,
    })
    .from(interviewTurns)
    .innerJoin(interviewSessions, eq(interviewTurns.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.workId, workId))
    .orderBy(desc(interviewTurns.createdAt))
    .limit(COVERED_LIMIT)
  const [coveredTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewTurns)
    .innerJoin(interviewSessions, eq(interviewTurns.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.workId, workId))

  // The plan reads every turn of the work, not the capped covered list, so a topic closed long
  // ago stays closed.
  const planRows = await db
    .select({
      topic: interviewTurns.topic,
      answer: interviewTurns.answer,
      skipped: interviewTurns.skipped,
      focus: interviewTurns.focus,
    })
    .from(interviewTurns)
    .innerJoin(interviewSessions, eq(interviewTurns.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.workId, workId))
    .orderBy(asc(interviewTurns.createdAt))

  const recentRows = await db
    .select({
      topic: interviewTurns.topic,
      question: interviewTurns.question,
      answer: interviewTurns.answer,
      skipped: interviewTurns.skipped,
    })
    .from(interviewTurns)
    .where(and(eq(interviewTurns.sessionId, sessionId), answeredOrSkipped()))
    .orderBy(desc(interviewTurns.createdAt))
    .limit(RECENT_LIMIT)

  const covered = coveredRows.reverse()
  const total = coveredTotal?.count ?? 0

  return {
    work: {
      title: work.title,
      genre: work.genre,
      logline: work.logline,
      synopsis: work.synopsis,
    },
    wiki: {
      counts,
      entries: entries.slice(0, ENTRY_LIMIT).map((e) => ({
        name: e.name,
        kind: e.kind,
        factCount: factCountByEntry.get(e.id) ?? 0,
        summary: cut(e.summary, ENTRY_SUMMARY_CHARS),
        // Speech feature only: a character card without 말투 is marked in the question prompt.
        ...(speech
          ? {
              hasSpeech: e.kind === 'character' ? (e.fields.speech ?? '').trim() !== '' : undefined,
            }
          : {}),
      })),
      openThreads: openThreads.map((t) => ({
        title: t.title,
        targetChapterPosition: t.targetChapterPosition,
      })),
    },
    story: {
      latestPosition,
      recentSummaries: summaryRows.reverse(),
      readerReactions: readerRows.flatMap((row) => {
        const parsed = ReaderSimSchema.safeParse(row.output)
        if (!parsed.success) return []
        const personas = parsed.data.personas
        const highRisk = personas.filter((p) => p.dropOffRisk === 'high').length
        const overall = cut(
          personas
            .map((p) => p.overall.trim())
            .filter((text) => text !== '')
            .join(' / '),
          READER_DIGEST_CHARS - 20,
        )
        return [
          {
            position: row.position,
            digest: cut(`이탈 위험 높음 ${highRisk}명: ${overall}`, READER_DIGEST_CHARS),
          },
        ]
      }),
      openIssueCount: openIssues?.count ?? 0,
    },
    covered: covered.map((turn) => ({
      topic: turn.topic,
      question: cut(turn.question, COVERED_QUESTION_CHARS),
      answer: turn.answer === null ? null : cut(turn.answer, COVERED_ANSWER_CHARS),
      skipped: turn.skipped,
      focus: turn.focus,
    })),
    coveredDropped: Math.max(0, total - covered.length),
    recent: recentRows.reverse().map((turn) => ({
      topic: turn.topic,
      question: turn.question,
      answer: turn.answer === null ? null : cut(turn.answer, RECENT_ANSWER_CHARS),
      skipped: turn.skipped,
    })),
    plan: planInterviewTopics(planRows, CORE_TOPICS),
  }
}

/** A turn that was answered or skipped, so it counts as covered. */
function answeredOrSkipped() {
  return or(isNotNull(interviewTurns.answer), eq(interviewTurns.skipped, true))
}
