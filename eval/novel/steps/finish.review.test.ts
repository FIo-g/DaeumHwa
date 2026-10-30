import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig } from '../state'
import { buildRunSummary, readSummaryInputs } from './finish'

// Review fix: context hits are measured on the chapter text the continuity check saw, which is the
// pre-rewrite copy when a scene rewrite ran after the check.

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
  runId: 'run-review',
  modelId: 'fake',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: at(0),
  commit: 'test',
}

const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'finish-review-'))
  dirs.push(dir)
  return dir
}

function writeFile(dir: string, rel: string, text: string): void {
  const file = join(dir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 서윤 is in the check pack, 민준 is not. Both exist before the check ran.
const cards = [
  { name: '서윤', aliases: [], createdAt: at(0) },
  { name: '민준', aliases: [], createdAt: at(0) },
]
const check = call({
  task: 'continuity-check',
  step: 'ch1:check',
  startedAt: at(1_000),
  prompt: '<wiki>\n[E1] 서윤 (인물)\n</wiki>',
})

describe('contextHit reads the text the continuity check saw', () => {
  it('uses the pre-rewrite chapter text when a scene rewrite ran after the check', () => {
    const dir = newDir()
    writeFile(dir, 'wiki-final.json', JSON.stringify({ entries: cards }))
    // The check saw this text: it names only the card in the pack.
    writeFile(dir, 'chapters/01.pre-rewrite.md', '서윤이 웃었다.')
    // The rewrite then added a name that the pack did not have.
    writeFile(dir, 'chapters/01.md', '서윤과 민준이 웃었다.')

    const summary = buildRunSummary([check], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary.continuity?.contextHit).toEqual({
      chapters: 1,
      named: 1,
      inPack: 1,
      rate: 1,
      byChapter: { '1': { named: 1, inPack: 1 } },
    })
  })

  it('uses the chapter text when there is no pre-rewrite file', () => {
    const dir = newDir()
    writeFile(dir, 'wiki-final.json', JSON.stringify({ entries: cards }))
    writeFile(dir, 'chapters/01.md', '서윤과 민준이 웃었다.')

    const summary = buildRunSummary([check], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary.continuity?.contextHit).toEqual({
      chapters: 1,
      named: 2,
      inPack: 1,
      rate: 0.5,
      byChapter: { '1': { named: 2, inPack: 1 } },
    })
  })
})
