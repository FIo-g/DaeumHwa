import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'

// Reads `ai_runs` of writing tasks and prints, per work, how many calls came 5–60
// minutes after the previous writing call of the same work, and the share. No writes.
//
//   node --env-file=.env.local --import tsx eval/cache-gaps.ts --db <postgres url or pglite dir>

const WINDOW_MIN_MS = 5 * 60_000
const WINDOW_MAX_MS = 60 * 60_000

export type GapRun = { workId: string | null; createdAt: Date }

export type WorkGapSummary = {
  workId: string
  total: number
  inWindow: number
  share: number
}

/** Writing tasks whose gaps say something about cache lifetime. */
export function isWritingTask(task: string): boolean {
  return task === 'scene-fix' || task.startsWith('draft-')
}

/** Writing runs ordered by work and time. Filters out other tasks. */
export async function collectWritingRuns(db: Db): Promise<GapRun[]> {
  const rows = await db
    .select({ workId: aiRuns.workId, createdAt: aiRuns.createdAt, task: aiRuns.task })
    .from(aiRuns)
  return rows
    .filter((row) => isWritingTask(row.task))
    .map((row) => ({ workId: row.workId, createdAt: new Date(row.createdAt) }))
    .sort(
      (a, b) =>
        (a.workId ?? '').localeCompare(b.workId ?? '') ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
}

/**
 * Per work: `total` calls, `inWindow` calls 5–60 minutes after the previous writing
 * call of the same work, and `share` = inWindow / gaps (0 when fewer than two calls).
 */
export function summarizeGaps(runs: GapRun[]): WorkGapSummary[] {
  const byWork = new Map<string, number[]>()
  for (const run of runs) {
    if (run.workId === null) continue
    const list = byWork.get(run.workId) ?? []
    list.push(run.createdAt.getTime())
    byWork.set(run.workId, list)
  }
  return [...byWork.entries()]
    .map(([workId, times]) => {
      const sorted = [...times].sort((a, b) => a - b)
      let inWindow = 0
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = sorted[i] - sorted[i - 1]
        if (gap >= WINDOW_MIN_MS && gap <= WINDOW_MAX_MS) inWindow += 1
      }
      const gaps = Math.max(0, sorted.length - 1)
      return { workId, total: sorted.length, inWindow, share: gaps === 0 ? 0 : inWindow / gaps }
    })
    .sort((a, b) => a.workId.localeCompare(b.workId))
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} value is missing`)
  return value
}

function openDb(value: string): Db {
  if (/^postgres(ql)?:\/\//.test(value)) {
    const client = postgres(value, { prepare: false, max: 1 })
    return drizzlePostgres(client, { schema: { aiRuns } }) as unknown as Db
  }
  return drizzlePglite(new PGlite(value), { schema: { aiRuns } }) as unknown as Db
}

async function main(): Promise<void> {
  const dbArg = argValue('--db')
  if (!dbArg) throw new Error('--db <postgres url or pglite dir> is missing')
  const db = openDb(dbArg)
  try {
    const runs = await collectWritingRuns(db)
    for (const summary of summarizeGaps(runs)) {
      const gaps = Math.max(0, summary.total - 1)
      console.log(
        `${summary.workId}: ${summary.inWindow}/${gaps} in 5-60 min (${(summary.share * 100).toFixed(1)}%)`,
      )
    }
  } finally {
    const client = (db as unknown as { $client: unknown }).$client
    if (client instanceof PGlite) {
      await client.waitReady
      await client.close()
    } else {
      await (client as { end: () => Promise<void> }).end()
    }
  }
}

// Runs the CLI only when executed directly; tests import the helpers without starting it.
if (!process.env.VITEST) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
