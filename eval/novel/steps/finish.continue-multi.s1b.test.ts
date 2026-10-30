import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig } from '../state'
import { buildRunSummary, readSummaryInputs } from './finish'

// Stage 1b fix F8: the run summary counts every continuation failure of an attempt, not one per file.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'finish-continue-multi-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  return dir
}

const config: RunConfig = {
  runId: 'run-s1b',
  modelId: 'fake',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: '2026-10-21T00:00:00.000Z',
  commit: 'test',
}

const call = {
  task: 'draft-chapter',
  step: null,
  kind: 'object',
  startedAt: '2026-10-21T00:00:00.000Z',
  durationMs: 0,
  firstTokenMs: null,
  speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
  productTimeoutMs: 120_000,
  wouldTimeOut: false,
  prompt: '',
  error: null,
} as unknown as CallRecord

function summaryOf(dir: string) {
  return buildRunSummary([call], newState(config), 'ko', readSummaryInputs(dir))
}

describe('run summary counts continuation failures per entry', () => {
  it('counts each entry of a multi-warning attempt file', () => {
    const dir = newDir()
    writeFileSync(
      join(dir, 'chapters', '01.attempt-1.continue.json'),
      JSON.stringify({
        kind: 'continue-failed',
        reason: 'EXPAND_REJECTED',
        failure: 'model',
        failures: [
          { reason: 'EXPAND_REJECTED', failure: 'model' },
          { reason: 'EXPAND_REJECTED', failure: 'model' },
          { reason: 'EXPAND_ERROR', failure: 'model' },
        ],
      }),
    )
    const summary = summaryOf(dir)
    expect(summary.draft?.continueFailed).toMatchObject({
      total: 3,
      external: 0,
      byReason: { EXPAND_REJECTED: 2, EXPAND_ERROR: 1 },
      byChapter: { '1': 3 },
    })
  })

  it('still counts an old single-record attempt file as one failure', () => {
    const dir = newDir()
    writeFileSync(
      join(dir, 'chapters', '01.attempt-1.continue.json'),
      JSON.stringify({ kind: 'continue-failed', reason: 'EMPTY', failure: 'model' }),
    )
    expect(summaryOf(dir).draft?.continueFailed).toMatchObject({ total: 1, byReason: { EMPTY: 1 } })
  })
})
