import { AppError } from '@/lib/errors'
import { suggestStyleCard } from '@/server/ai-features'
import { listEntries } from '@/server/wiki'
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

// Style cards: one suggestion per main character that exists as a wiki entry, then the author
// reviews all suggested cards together. A character with too few dialogue lines is recorded as
// failed and skipped.

export const styleSuggest: StepFn = async (ctx, _key, state) => {
  if (isMarked(state, 'style:suggest')) return 'done'
  const workId = requireWorkId(state)
  const entries = await listEntries(ctx.db, ctx.actor, workId, { kinds: ['character'] })

  for (const character of ctx.bible.characters.filter((c) => c.main)) {
    const key = `style:suggest:${character.key}`
    if (isMarked(state, key)) continue
    const entry = entries.find((candidate) => candidate.name === character.name)
    if (entry) {
      try {
        const row = await withModelRetry(ctx, state, `style:${character.name}`, () =>
          suggestStyleCard(ctx.db, ctx.actor, { workId, entryId: entry.id }, ctx.client),
        )
        if (row) state.data.styleProposalIds = [...(state.data.styleProposalIds ?? []), row.id]
      } catch (error) {
        if (!(error instanceof AppError && error.code === 'BAD_STATE')) throw error
        state.failed.push({ step: `style:${character.name}`, message: 'no dialogue' })
      }
    }
    mark(ctx, state, key)
  }
  mark(ctx, state, 'style:suggest')
  return 'done'
}

export const styleReview: StepFn = async (ctx, key, state) => {
  if (isMarked(state, key)) return 'done'
  const workId = requireWorkId(state)
  const ids = state.data.styleProposalIds ?? []
  let review: Pending | null = pendingFor(ctx.dir, key, 'proposals')
  if (!review) {
    const views = (await listProposals(ctx.db, ctx.actor, workId, { source: 'style' })).filter(
      (view) => ids.includes(view.id),
    )
    if (views.length === 0) {
      mark(ctx, state, key)
      return 'done'
    }
    review = {
      kind: 'proposals',
      step: key,
      source: 'style',
      chapter: null,
      chapterFile: null,
      items: toProposalItems(views),
    }
  }
  const answer = consult(ctx, review) as Extract<Answer, { kind: 'proposals' }> | null
  if (!answer) {
    persist(ctx, state)
    return 'pending'
  }
  await applyProposalDecisions(ctx, state, key, answer.decisions)
  mark(ctx, state, key)
  settle(ctx, review, answer)
  return 'done'
}
