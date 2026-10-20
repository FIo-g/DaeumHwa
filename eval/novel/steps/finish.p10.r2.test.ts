import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig } from '../state'
import {
  buildRunSummary,
  ExtractionCountsSchema,
  readSummaryInputs,
  RunSummarySchema,
} from './finish'

// Round 2, P10: the weak-evidence counters in the extraction block of the run summary.

/** An ISO start time the given number of ms after a fixed origin. */
function at(ms: number): string {
  return new Date(Date.UTC(2026, 9, 18, 0, 0, 0) + ms).toISOString()
}

// Only the fields the summary reads are set; the rest is cast away.
function call(fields: Partial<CallRecord>): CallRecord {
  return {
    task: 'draft-chapter',
    step: null,
    kind: 'object',
    startedAt: at(0),
    durationMs: 0,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    productTimeoutMs: 120_000,
    wouldTimeOut: false,
    prompt: '',
    error: null,
    ...fields,
  } as CallRecord
}

const config: RunConfig = {
  runId: 'run-p10',
  modelId: 'fake',
  lang: 'ko',
  chapters: 2,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: at(0),
  commit: 'test',
}

const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'finish-p10-'))
  dirs.push(dir)
  return dir
}

function writeFile(dir: string, rel: string, text: string): void {
  const file = join(dir, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The summary as a saved run file would hold it. */
function roundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

const four = {
  fragmentNamesFixed: 1,
  relationsDropped: 0,
  duplicateFacts: 2,
  unverifiedEvidence: 0,
}

describe('ExtractionCountsSchema weak counters (P10)', () => {
  it('accepts the old four-key object without weak keys', () => {
    const parsed = ExtractionCountsSchema.parse(four)
    expect(parsed).toEqual(four)
    expect(parsed).not.toHaveProperty('weakFactEvidence')
    expect(parsed).not.toHaveProperty('weakThreadEvidence')
  })

  it('accepts the six-key object with both weak values', () => {
    const parsed = ExtractionCountsSchema.parse({
      ...four,
      weakFactEvidence: 3,
      weakThreadEvidence: 1,
    })
    expect(parsed.weakFactEvidence).toBe(3)
    expect(parsed.weakThreadEvidence).toBe(1)
  })

  it('rejects a negative weak value', () => {
    expect(ExtractionCountsSchema.safeParse({ ...four, weakFactEvidence: -1 }).success).toBe(false)
  })
})

describe('buildRunSummary weak counters (P10)', () => {
  it('sums the weak counters and keeps each chapter own values', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: {
        '1': { ...four, weakFactEvidence: 3, weakThreadEvidence: 1 },
        '2': { ...four, weakFactEvidence: 2, weakThreadEvidence: 0 },
      },
    })
    expect(summary.extraction?.totals).toMatchObject({
      weakFactEvidence: 5,
      weakThreadEvidence: 1,
    })
    expect(summary.extraction?.byChapter['1']).toMatchObject({
      weakFactEvidence: 3,
      weakThreadEvidence: 1,
    })
    expect(summary.extraction?.byChapter['2']).toMatchObject({
      weakFactEvidence: 2,
      weakThreadEvidence: 0,
    })
  })

  it('counts a chapter without the keys as zero next to one with them', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: {
        '1': { ...four, weakFactEvidence: 4 },
        '2': { ...four },
      },
    })
    expect(summary.extraction?.totals.weakFactEvidence).toBe(4)
    expect(summary.extraction?.totals).not.toHaveProperty('weakThreadEvidence')
  })

  it('leaves the weak keys out of the totals when no chapter has them', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: { '1': { ...four } },
    })
    expect(summary.extraction?.totals).not.toHaveProperty('weakFactEvidence')
    expect(summary.extraction?.totals).not.toHaveProperty('weakThreadEvidence')
  })

  it('parses a summary with the weak totals after a JSON round trip', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: { '1': { ...four, weakFactEvidence: 2, weakThreadEvidence: 1 } },
    })
    const parsed = RunSummarySchema.parse(roundTrip(summary))
    expect(parsed.extraction?.totals).toMatchObject({ weakFactEvidence: 2, weakThreadEvidence: 1 })
  })
})

describe('readSummaryInputs weak counters (P10)', () => {
  it('reads the weak keys of a chapter extraction file', () => {
    const dir = newDir()
    const six = { ...four, weakFactEvidence: 3, weakThreadEvidence: 1 }
    writeFile(dir, 'chapters/01.extraction.json', JSON.stringify(six))
    expect(readSummaryInputs(dir).extraction).toEqual({ '1': six })
  })
})
