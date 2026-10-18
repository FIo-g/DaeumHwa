import {
  askNextQuestion,
  answerTurn,
  completeInterview,
  skipTurn,
  startInterview,
} from '@/server/interview'
import { listProposals } from '@/server/proposals'
import type { Answer, Pending } from '../author-io'
import type { StepFn } from '../run'
import {
  applyProposalDecisions,
  consult,
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
// author decides each one. Every AI call and every service write is marked so a rerun resumes.

type InterviewAnswer = Extract<Answer, { kind: 'interview_answer' }>
type ProposalsAnswer = Extract<Answer, { kind: 'proposals' }>

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
      // While the question is open this returns it without a model call, so a resume reads the
      // same question back.
      const turn = await askNextQuestion(ctx.db, ctx.actor, sessionId, ctx.client)
      const question: Pending = {
        kind: 'interview_answer',
        step,
        turnId: turn.id,
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
      const extracted = await withModelRetry(ctx, state, 'interview:answer', () =>
        answerTurn(ctx.db, ctx.actor, { turnId: turn.id, answer: answer.answer }, ctx.client),
      )
      if (extracted) {
        state.data.turnProposalIds = extracted.proposals.map((row) => row.id)
      } else {
        // The extraction failed twice. Skip the question so the interview can move on.
        await skipTurn(ctx.db, ctx.actor, turn.id)
        state.data.turnProposalIds = []
      }
      state.data.focusCounts[turn.focus] = (state.data.focusCounts[turn.focus] ?? 0) + 1
      mark(ctx, state, `${step}:answered`)
      settle(ctx, question, answer)
    }

    let proposals = pendingFor(ctx.dir, step, 'proposals')
    if (!proposals) {
      const ids = state.data.turnProposalIds ?? []
      const views = (
        await listProposals(ctx.db, ctx.actor, workId, {
          source: 'interview',
          sourceRef: turnId,
        })
      ).filter((view) => ids.includes(view.id))
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
      await applyProposalDecisions(ctx, state, decided.decisions)
      settle(ctx, proposals, decided)
    }

    state.data.asked += 1
    state.data.openTurnId = undefined
    state.data.turnProposalIds = undefined
    persist(ctx, state)
  }

  if (!isMarked(state, 'interview:completed')) {
    await completeInterview(ctx.db, ctx.actor, sessionId)
    mark(ctx, state, 'interview:completed')
  }
  return 'done'
}
