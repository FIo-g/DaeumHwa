import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { loadState, newState } from '../state'
import { buildRunSummary, readSummaryInputs, RunSummarySchema } from './finish'
import { readCallRecords } from './util'

// The harness block in the run summary (stage 0). Old runs have no cache fields and no
// deploySettings, so they still summarize, with cache tokens 0 and cost from the price table.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const OLD_RUN = join(process.cwd(), 'eval/results/novel/2026-10-19-r2a/run-04-ko')

/** A run dir with one saved chapter and a Haiku config. */
function runDir(config: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-finish-harness-s0-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(join(dir, 'chapters', '01.md'), '세린이 웃었다.\n')
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ lang: 'ko', modelId: 'haiku-5.5', chapters: 1, ...config }),
  )
  return dir
}

const state = newState({
  runId: 'test',
  modelId: 'haiku-5.5',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: '2026-10-20T00:00:00.000Z',
  commit: 'test',
})

describe('harness summary block', () => {
  it('summarizes an old run with no cache fields and no deploySettings', () => {
    if (!existsSync(join(OLD_RUN, 'config.json'))) return
    const inputs = readSummaryInputs(OLD_RUN)
    const summary = buildRunSummary(readCallRecords(OLD_RUN), loadState(OLD_RUN), 'ko', inputs)
    const chapter = summary.harness?.chapters[0]
    expect(chapter?.calls).toBeGreaterThan(0)
    expect(chapter?.cacheReadTokens).toBe(0)
    expect(chapter?.cacheRecorded).toBe(false)
    expect(chapter?.usd).toBeGreaterThan(0)
    expect(summary.harness?.settings).toBe('eval')
    expect(RunSummarySchema.parse(summary).harness).toEqual(summary.harness)
  })

  it('reads settings and cache tokens from a synthetic run', () => {
    const dir = runDir({ deploySettings: true })
    const calls = [
      {
        seq: 1,
        task: 'draft-chapter',
        step: 'ch1:draft',
        kind: 'stream',
        durationMs: 20000,
        firstTokenMs: 1200,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 7, cacheWriteTokens: 2 },
      },
    ] as unknown as CallRecord[]
    const summary = buildRunSummary(calls, state, 'ko', readSummaryInputs(dir))
    expect(summary.harness?.settings).toBe('deploy')
    expect(summary.harness?.chapters[0]?.cacheReadTokens).toBe(7)
    expect(summary.harness?.chapters[0]?.cacheWriteTokens).toBe(2)
    expect(summary.harness?.chapters[0]?.firstCharMs).toBe(1200)
    expect(summary.harness?.priceSource).toMatch(/official pricing/)
  })

  it('leaves the block out of a run with no config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'novel-finish-harness-none-s0-'))
    dirs.push(dir)
    const summary = buildRunSummary([], state, 'ko', readSummaryInputs(dir))
    expect(summary.harness).toBeUndefined()
  })
})
