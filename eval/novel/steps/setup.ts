import { createWork } from '@/server/works'
import { createNamingRule } from '@/server/naming'
import { createStyleCard } from '@/server/styles'
import { createThread } from '@/server/threads'
import { createTestUser } from '@/test/factories'
import type { StepFn } from '../run'
import { isMarked, mark, persist, requireWorkId } from './util'

// Creates the eval user and the work, then seeds what the author types in the UI before the
// interview: naming rules, planned threads and the work style card. Nothing else is seeded.

export const setup: StepFn = async (ctx, _key, state) => {
  if (!state.data.userId) {
    const user = await createTestUser(ctx.db)
    state.data.userId = user.id
    persist(ctx, state)
  }
  ctx.actor = { userId: state.data.userId }

  if (!state.data.workId) {
    const work = await createWork(ctx.db, ctx.actor, ctx.bible.work)
    state.data.workId = work.id
    persist(ctx, state)
  }
  const workId = requireWorkId(state)

  for (const rule of ctx.bible.namingRules) {
    const key = `setup:naming:${rule.canonical}`
    if (isMarked(state, key)) continue
    await createNamingRule(ctx.db, ctx.actor, {
      workId,
      canonical: rule.canonical,
      variants: rule.variants,
      note: rule.note,
    })
    mark(ctx, state, key)
  }

  for (const thread of ctx.bible.threads) {
    const key = `setup:thread:${thread.key}`
    if (isMarked(state, key)) continue
    await createThread(ctx.db, ctx.actor, {
      workId,
      title: thread.title,
      description: thread.description,
      status: 'planned',
      targetChapterPosition: thread.targetChapter,
      importance: thread.importance,
    })
    mark(ctx, state, key)
  }

  const style = ctx.bible.workStyle
  if (!isMarked(state, 'setup:style')) {
    await createStyleCard(ctx.db, ctx.actor, {
      workId,
      entryId: null,
      name: style.name,
      tone: style.tone,
      rules: style.rules,
      examples: style.examples,
    })
    mark(ctx, state, 'setup:style')
  }
  return 'done'
}
