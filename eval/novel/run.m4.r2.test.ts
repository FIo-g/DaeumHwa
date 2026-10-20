import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// --product-limits through a whole fake run (track M4). Kept apart from run.speech-off.test.ts.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Runs one fake-profile run to its first blocking point and returns its directory. */
async function fakeRun(productLimits: boolean | undefined): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-m4-'))
  dirs.push(dir)
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    productLimits,
  })
  const ctx = await openRun(dir, { autoAuthor: true })
  try {
    await runUntilBlocked(ctx)
  } finally {
    await ctx.close()
  }
  return dir
}

describe('run productLimits', () => {
  it('a product-limits run sends the task caps', async () => {
    const dir = await fakeRun(true)
    const records = readCallRecords(dir)
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record.maxTokensRule).toBe('product')
      expect(record.maxTokens).toBe(record.taskMaxTokens)
    }
    const summary = JSON.parse(readFileSync(join(dir, 'run-summary.json'), 'utf8'))
    expect(summary.outputCap.mode).toBe('product')
  }, 60_000)

  it('a default run keeps the floor', async () => {
    const dir = await fakeRun(undefined)
    const records = readCallRecords(dir)
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record.maxTokensRule).toBe('floor')
      expect(record.maxTokens).toBe(32000)
      // The draft and its continuation have their own 32000 cap since stage 0; others are lower.
      expect(record.taskMaxTokens).toBeLessThanOrEqual(32000)
    }
    const summary = JSON.parse(readFileSync(join(dir, 'run-summary.json'), 'utf8'))
    expect(summary.outputCap.mode).toBe('floor')
    expect(summary.outputCap.cutOff.total).toBe(0)
  }, 60_000)
})
