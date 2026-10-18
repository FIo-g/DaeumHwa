import { eq } from 'drizzle-orm'
import { interviewSessions, interviewTurns } from '@/db/schema'
import {
  answerTurn,
  askNextQuestion,
  completeInterview,
  skipTurn,
  startInterview,
} from '@/server/interview'
import { listProposals } from '@/server/proposals'
import type { Answer, Pending } from '../author-io'
import type { RunContext, StepFn } from '../run'
import {
  applyProposalDecisions,
  consult,
  guarded,
  isMarked,
  mark,
  pendingFor,
  persist,
  requireWorkId,
  settle,
  toProposalItems,
  withModelRetry,
} from './util'

// Interview: one question at a time. Each answer is extracted into pending proposals, and the
// author decides each one. Every service write is followed by a mark. The database is checked
// first on a rerun, so a write that committed before its mark is adopted, not repeated.

type InterviewAnswer = Extract<Answer, { kind: 'interview_answer' }>
type ProposalsAnswer = Extract<Answer, { kind: 'proposals' }>

async function loadTurn(ctx: RunContext, turnId: string) {
  const [row] = await ctx.db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.id, turnId))
    .limit(1)
  if (!row) throw new Error(`interview turn is missing: ${turnId}`)
  return row
}

async function sessionStatus(ctx: RunContext, sessionId: string): Promise<string | undefined> {
  const [row] = await ctx.db
    .select({ status: interviewSessions.status })
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId))
    .limit(1)
  return row?.status
}

export const interview: StepFn = async (ctx, _key, state) => {
  const workId = requireWorkId(state)
  if (!isMarked(state, 'interview:started')) {
    const session = await startInterview(ctx.db, ctx.actor, workId)
    state.data.sessionId = session.id
    mark(ctx, state, 'interview:started')
  }
  const sessionId = state.data.sessionId
  if (!sessionId) throw new Error('interview session is missing')

  while (state.data.asked < ctx.config.questions) {
    if (!state.data.openTurnId) {
      const asked = await withModelRetry(ctx, state, 'interview:ask', () =>
        askNextQuestion(ctx.db, ctx.actor, sessionId, ctx.client),
      )
      if (!asked) {
        state.data.asked += 1
        persist(ctx, state)
        continue
      }
      state.data.openTurnId = asked.id
      persist(ctx, state)
    }
    const turnId = state.data.openTurnId
    const step = `interview:${turnId}`

    if (!isMarked(state, `${step}:answered`)) {
      const turn = await loadTurn(ctx, turnId)
      // Still open: ask the author and extract. Already answered or skipped (the commit happened
      // before the mark was saved): go straight to the bookkeeping.
      if (turn.answer === null && !turn.skipped) {
        const question: Pending = {
          kind: 'interview_answer',
          step,
          turnId,
          focus: turn.focus,
          topic: turn.topic,
          question: turn.question,
          asked: state.data.asked + 1,
          limit: ctx.config.questions,
        }
        const answer = consult(ctx, question) as InterviewAnswer | null
        if (!answer) {
          persist(ctx, state)
          return 'pending'
        }
        const extracted = await guarded(ctx, state, 'interview:answer', () =>
          answerTurn(ctx.db, ctx.actor, { turnId, answer: answer.answer }, ctx.client),
        )
        // The extraction failed or the answer was empty: skip the question so the interview moves on.
        if (!extracted) await skipTurn(ctx.db, ctx.actor, turnId)
      }
      state.data.focusCounts[turn.focus] = (state.data.focusCounts[turn.focus] ?? 0) + 1
      mark(ctx, state, `${step}:answered`)
      // The answer's effects are saved. Log it if the question is still waiting for settling.
      const waiting = pendingFor(ctx.dir, step, 'interview_answer')
      const logged = waiting ? consult(ctx, waiting) : null
      if (waiting && logged) settle(ctx, waiting, logged)
    }

    let proposals = pendingFor(ctx.dir, step, 'proposals')
    if (!proposals) {
      const views = await listProposals(ctx.db, ctx.actor, workId, {
        source: 'interview',
        sourceRef: turnId,
      })
      if (views.length > 0) {
        proposals = {
          kind: 'proposals',
          step,
          source: 'interview',
          chapter: null,
          chapterFile: null,
          items: toProposalItems(views),
        }
      }
    }
    if (proposals) {
      const decided = consult(ctx, proposals) as ProposalsAnswer | null
      if (!decided) {
        persist(ctx, state)
        return 'pending'
      }
      await applyProposalDecisions(ctx, state, step, decided.decisions)
      settle(ctx, proposals, decided)
    }

    state.data.asked += 1
    state.data.openTurnId = undefined
    persist(ctx, state)
  }

  if (!isMarked(state, 'interview:completed')) {
    // Ended by an earlier run whose mark was lost: nothing to end again.
    if ((await sessionStatus(ctx, sessionId)) === 'active') {
      await completeInterview(ctx.db, ctx.actor, sessionId)
    }
    mark(ctx, state, 'interview:completed')
  }
  return 'done'
}
