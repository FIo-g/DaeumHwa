import { listFacts } from '@/server/facts'
import { listNamingRules } from '@/server/naming'
import { listRelations } from '@/server/relations'
import { listStyleCards } from '@/server/styles'
import { listThreads } from '@/server/threads'
import { listEntries } from '@/server/wiki'
import type { StepFn } from '../run'
import { readCallRecords, requireWorkId, writeRunFile } from './util'

// Writes the final wiki snapshot and the run summary. Calls are read from disk, so the summary
// covers every resume, not only this process.

export const finish: StepFn = async (ctx, _key, state) => {
  const workId = requireWorkId(state)
  const entries = await listEntries(ctx.db, ctx.actor, workId)
  const facts = await listFacts(ctx.db, ctx.actor, workId)
  const threads = await listThreads(ctx.db, ctx.actor, workId)
  const relations = await listRelations(ctx.db, ctx.actor, workId)
  const namingRules = await listNamingRules(ctx.db, ctx.actor, workId)
  const styleCards = await listStyleCards(ctx.db, ctx.actor, workId)

  writeRunFile(
    ctx.dir,
    'wiki-final.json',
    `${JSON.stringify(
      {
        entries: entries.map((entry) => ({
          ...entry,
          facts: facts.filter((fact) => fact.entryId === entry.id),
        })),
        threads,
        relations,
        namingRules,
        styleCards,
      },
      null,
      2,
    )}\n`,
  )

  const calls = readCallRecords(ctx.dir)
  const byTask: Record<string, { count: number; tokens: number; totalMs: number }> = {}
  for (const call of calls) {
    const row = byTask[call.task] ?? { count: 0, tokens: 0, totalMs: 0 }
    row.count += 1
    row.tokens += (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0)
    row.totalMs += call.durationMs
    byTask[call.task] = row
  }

  writeRunFile(
    ctx.dir,
    'run-summary.json',
    `${JSON.stringify(
      {
        calls: { total: calls.length, byTask },
        wouldTimeOut: calls.filter((call) => call.wouldTimeOut).length,
        contextOverflow: calls.filter((call) => call.contextOverflow).length,
        hangulLeft: calls.reduce((sum, call) => sum + call.hangulLeft, 0),
        failed: state.failed,
        pauses: state.pauses,
        drafts: state.data.drafts,
        focusCounts: state.data.focusCounts,
      },
      null,
      2,
    )}\n`,
  )
  return 'done'
}
