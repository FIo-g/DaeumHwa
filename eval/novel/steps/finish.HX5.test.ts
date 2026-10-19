import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig } from '../state'
import { continueFailureOf, recordContinueFailure } from './chapter'
import type { RunContext } from '../run'
import { ExternalFailureError } from './util'
import {
  buildRunSummary,
  parseContinuityResults,
  readSummaryInputs,
  RunSummarySchema,
  timeoutSummary,
} from './finish'

// Measurement wiring (HX5): the run summary's optional blocks and their inputs.

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

/** A call whose wouldTimeOut follows from its duration and its product timeout, as the client sets it. */
function timed(fields: Partial<CallRecord> & { durationMs: number }): CallRecord {
  const base = call(fields)
  return { ...base, wouldTimeOut: base.durationMs > base.productTimeoutMs }
}

const config: RunConfig = {
  runId: 'run-hx5',
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
  const dir = mkdtempSync(join(tmpdir(), 'finish-hx5-'))
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

const OLD_SUMMARY = {
  calls: { total: 1, byTask: { 'draft-chapter': { count: 1, tokens: 10, totalMs: 500 } } },
  speed: {
    byTask: {
      'draft-chapter': {
        calls: 1,
        medianOutputTokensPerSec: 20,
        medianPromptTokensPerSec: null,
        medianFirstTokenMs: null,
      },
    },
    overall: { medianOutputTokensPerSec: 20, medianPromptTokensPerSec: null, source: 'wall' },
    perChapterMs: {},
    perChapterModelMs: {},
  },
  wouldTimeOut: 0,
  contextOverflow: 0,
  hangulLeft: null,
  failed: [],
  pauses: {},
  drafts: {},
  focusCounts: {},
  interview: {
    asked: 0,
    answered: 0,
    undecided: 0,
    undecidedShare: 0,
    setting: 0,
    story: 0,
    storyShare: 0,
    duplicateQuestions: 0,
    sameTopicAfterUndecided: 0,
    multiAsk: 0,
    storyAfterCoreDone: 0,
    undecidedShareInBank: 0,
  },
}

describe('RunSummarySchema', () => {
  it('parses a summary saved before the new blocks existed', () => {
    const parsed = RunSummarySchema.parse(OLD_SUMMARY)
    expect(parsed).not.toHaveProperty('extraction')
    expect(parsed).not.toHaveProperty('proofread')
    expect(parsed).not.toHaveProperty('continuity')
    expect(parsed).not.toHaveProperty('timeouts')
  })

  it('accepts the builder output without inputs, with timeouts and no measured blocks', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko')
    const parsed = RunSummarySchema.parse(roundTrip(summary))
    expect(parsed.timeouts).toEqual({ total: 0, byTask: {} })
    expect(parsed).not.toHaveProperty('extraction')
    expect(parsed).not.toHaveProperty('proofread')
    expect(parsed).not.toHaveProperty('continuity')
    expect(parsed).not.toHaveProperty('draft')
  })
})

describe('timeoutSummary', () => {
  it('counts the calls over their product timeout per task, and not one at exactly the limit', () => {
    const calls = [
      timed({ task: 'chapter-extract', durationMs: 130_000 }),
      timed({ task: 'chapter-extract', durationMs: 130_000 }),
      timed({ task: 'chapter-extract', durationMs: 119_000 }),
      timed({ task: 'continuity-check', durationMs: 121_000 }),
      timed({ task: 'proofread', durationMs: 120_000 }),
    ]
    expect(timeoutSummary(calls)).toEqual({
      total: 3,
      byTask: { 'chapter-extract': 2, 'continuity-check': 1 },
    })
  })

  it('judges a stream against its own 280 s product timeout', () => {
    const calls = [
      timed({
        task: 'draft-chapter',
        kind: 'stream',
        productTimeoutMs: 280_000,
        durationMs: 200_000,
      }),
      timed({
        task: 'draft-chapter',
        kind: 'stream',
        productTimeoutMs: 280_000,
        durationMs: 290_000,
      }),
    ]
    expect(timeoutSummary(calls)).toEqual({ total: 1, byTask: { 'draft-chapter': 1 } })
  })

  it('falls back to 120 s for a record written before productTimeoutMs existed', () => {
    const legacy = call({
      task: 'chapter-extract',
      durationMs: 130_000,
      productTimeoutMs: undefined,
    })
    expect(timeoutSummary([legacy])).toEqual({ total: 1, byTask: { 'chapter-extract': 1 } })
  })

  it('totals to the same number as wouldTimeOut', () => {
    const calls = [
      timed({ task: 'chapter-extract', durationMs: 130_000 }),
      timed({
        task: 'draft-chapter',
        kind: 'stream',
        productTimeoutMs: 280_000,
        durationMs: 290_000,
      }),
      timed({
        task: 'draft-chapter',
        kind: 'stream',
        productTimeoutMs: 280_000,
        durationMs: 200_000,
      }),
      timed({ task: 'reader-sim', durationMs: 5_000 }),
    ]
    const summary = buildRunSummary(calls, newState(config), 'ko')
    expect(summary.timeouts?.total).toBe(summary.wouldTimeOut)
  })
})

describe('buildRunSummary extraction and proofread blocks', () => {
  it('sums the extraction counters over the chapters', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: {
        '1': {
          fragmentNamesFixed: 1,
          relationsDropped: 2,
          duplicateFacts: 0,
          unverifiedEvidence: 3,
        },
        '2': {
          fragmentNamesFixed: 0,
          relationsDropped: 1,
          duplicateFacts: 4,
          unverifiedEvidence: 0,
        },
      },
    })
    expect(summary.extraction).toEqual({
      chapters: 2,
      totals: {
        fragmentNamesFixed: 1,
        relationsDropped: 3,
        duplicateFacts: 4,
        unverifiedEvidence: 3,
      },
      byChapter: {
        '1': {
          fragmentNamesFixed: 1,
          relationsDropped: 2,
          duplicateFacts: 0,
          unverifiedEvidence: 3,
        },
        '2': {
          fragmentNamesFixed: 0,
          relationsDropped: 1,
          duplicateFacts: 4,
          unverifiedEvidence: 0,
        },
      },
    })
  })

  it('keeps a measured chapter with all-zero counters, and omits the block with no input', () => {
    const zero = {
      fragmentNamesFixed: 0,
      relationsDropped: 0,
      duplicateFacts: 0,
      unverifiedEvidence: 0,
    }
    const measured = buildRunSummary([call({})], newState(config), 'ko', {
      extraction: { '1': zero },
    })
    expect(measured.extraction).toEqual({ chapters: 1, totals: zero, byChapter: { '1': zero } })

    expect(
      buildRunSummary([call({})], newState(config), 'ko', { extraction: {} }),
    ).not.toHaveProperty('extraction')
    expect(buildRunSummary([call({})], newState(config), 'ko')).not.toHaveProperty('extraction')
  })

  it('counts only AI items and keeps the suggestion index as the decision id', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      proofread: {
        '1': {
          suggestions: [
            { source: 'rule', quote: '되요', replacement: '돼요', kind: 'spelling' },
            { source: 'ai', quote: '가다', replacement: '갔다', kind: 'awkward' },
            { source: 'ai', quote: '먹다', replacement: '먹었다', kind: 'spelling' },
          ],
          decisions: [
            { id: '1', accept: true },
            { id: '2', accept: false },
            { id: '0', accept: true },
          ],
        },
      },
    })
    expect(summary.proofread?.totals).toMatchObject({ total: 2, accepted: 1, acceptanceRatio: 0.5 })
  })

  it('sums proofread counts per chapter instead of merging the same quote across chapters', () => {
    const ai = [{ source: 'ai', quote: '되요', replacement: '돼요', kind: 'spelling' }]
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      proofread: {
        '1': { suggestions: ai, decisions: [{ id: '0', accept: true }] },
        '2': { suggestions: ai, decisions: [{ id: '0', accept: true }] },
      },
    })
    expect(summary.proofread?.totals).toMatchObject({
      distinctQuotes: 2,
      acceptedQuotes: 2,
      quoteAcceptanceRatio: 1,
    })
  })

  it('counts every decided chapter but lists only chapters with AI items by chapter', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      proofread: {
        '1': {
          suggestions: [{ source: 'rule', quote: '되요', replacement: '돼요', kind: 'spelling' }],
          decisions: [{ id: '0', accept: true }],
        },
        '2': {
          suggestions: [{ source: 'ai', quote: '가다', replacement: '갔다', kind: 'awkward' }],
          decisions: [{ id: '0', accept: true }],
        },
      },
    })
    expect(summary.proofread?.chapters).toBe(2)
    expect(Object.keys(summary.proofread?.byChapter ?? {})).toEqual(['2'])
    expect(summary.proofread?.totals).toMatchObject({ total: 1, accepted: 1 })
  })

  it('omits the proofread block when no chapter has an AI item', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', {
      proofread: {
        '1': {
          suggestions: [{ source: 'rule', quote: '되요', replacement: '돼요', kind: 'spelling' }],
          decisions: [{ id: '0', accept: true }],
        },
      },
    })
    expect(summary).not.toHaveProperty('proofread')
  })
})

describe('buildRunSummary continuity block', () => {
  const cards = [
    { name: '서윤', aliases: [], createdAt: at(0) },
    { name: '민준', aliases: [], createdAt: at(0) },
    // Created after the check ran, so it could not be in the pack.
    { name: '지후', aliases: [], createdAt: at(5_000) },
  ]
  const check = call({
    task: 'continuity-check',
    step: 'ch1:check',
    startedAt: at(1_000),
    prompt: '<wiki>\n[E1] 서윤 (인물)\n</wiki>',
  })

  it('reports the share of named cards that the continuity prompt contained', () => {
    const summary = buildRunSummary([check], newState(config), 'ko', {
      contextHit: { cards, chapterTexts: { '1': '서윤과 민준이 지후를 만났다.' } },
    })
    expect(summary.continuity?.contextHit).toEqual({
      chapters: 1,
      named: 2,
      inPack: 1,
      rate: 0.5,
      byChapter: { '1': { named: 2, inPack: 1 } },
    })
  })

  it('skips a chapter without a continuity call instead of counting it as zero', () => {
    const summary = buildRunSummary([check], newState(config), 'ko', {
      contextHit: {
        cards,
        chapterTexts: { '1': '서윤과 민준이 만났다.', '2': '서윤이 웃었다.' },
      },
    })
    expect(summary.continuity?.contextHit?.chapters).toBe(1)
    expect(summary.continuity?.contextHit?.byChapter).toEqual({ '1': { named: 2, inPack: 1 } })
  })

  it('omits the continuity block when no chapter has a usable call', () => {
    const summary = buildRunSummary([], newState(config), 'ko', {
      contextHit: { cards, chapterTexts: { '1': '서윤이 웃었다.' } },
    })
    expect(summary).not.toHaveProperty('continuity')
  })

  it('attaches the fixture recall when the input has one', () => {
    const fixture = {
      createdAt: at(0),
      mode: 'fake',
      model: 'fake',
      expected: 4,
      hits: 3,
      misses: 1,
      falsePositives: 0,
      precision: 1,
      recall: 0.75,
    }
    const summary = buildRunSummary([], newState(config), 'ko', { continuityFixture: fixture })
    expect(summary.continuity?.fixture).toEqual(fixture)
    expect(summary).not.toHaveProperty('continuity.contextHit')
  })
})

describe('parseContinuityResults', () => {
  const totals = { hits: 3, misses: [1], falsePositives: [], precision: 1, recall: 0.75 }
  const base = {
    mode: 'fake',
    model: 'fake-model',
    createdAt: at(0),
    fixture: 'work-a',
    budgetChars: 8000,
    expected: [{}, {}, {}, {}],
    notDefects: [],
    totals,
    runs: [],
  }

  it('reads an eval:continuity file with the H fields', () => {
    const parsed = parseContinuityResults({
      ...base,
      trapHits: [{}],
      coverage: { named: 4, inPack: 3, rate: 0.75 },
      overBudgetChapters: 0,
    })
    expect(parsed).toEqual({
      createdAt: at(0),
      mode: 'fake',
      model: 'fake-model',
      expected: 4,
      hits: 3,
      misses: 1,
      falsePositives: 0,
      precision: 1,
      recall: 0.75,
      trapHits: 1,
      coverage: { named: 4, inPack: 3, rate: 0.75 },
      overBudgetChapters: 0,
    })
  })

  it('reads a file without the H fields and leaves them undefined', () => {
    const parsed = parseContinuityResults(base)
    expect(parsed?.expected).toBe(4)
    expect(parsed?.recall).toBe(0.75)
    expect(parsed?.trapHits).toBeUndefined()
    expect(parsed?.coverage).toBeUndefined()
    expect(parsed?.overBudgetChapters).toBeUndefined()
  })

  it('returns null for a value that is not a results file', () => {
    expect(parseContinuityResults({})).toBeNull()
    expect(parseContinuityResults(null)).toBeNull()
  })
})

describe('readSummaryInputs', () => {
  it('returns no inputs for an empty run dir and does not throw', () => {
    expect(readSummaryInputs(newDir())).toEqual({})
  })

  it('skips a corrupt extraction file and reads the next chapter', () => {
    const dir = newDir()
    writeFile(dir, 'chapters/01.extraction.json', '{not json')
    writeFile(
      dir,
      'chapters/02.extraction.json',
      JSON.stringify({
        fragmentNamesFixed: 1,
        relationsDropped: 0,
        duplicateFacts: 0,
        unverifiedEvidence: 2,
      }),
    )
    expect(readSummaryInputs(dir).extraction).toEqual({
      '2': { fragmentNamesFixed: 1, relationsDropped: 0, duplicateFacts: 0, unverifiedEvidence: 2 },
    })
  })

  it('uses the last proofread decision line of a chapter', () => {
    const dir = newDir()
    writeFile(
      dir,
      'chapters/01.proofread.json',
      JSON.stringify([{ source: 'ai', quote: '되요', replacement: '돼요', kind: 'spelling' }]),
    )
    const line = (step: string, kind: string, decisions: { id: string; accept: boolean }[]) =>
      JSON.stringify({
        at: at(0),
        step,
        kind,
        answer: { kind, decisions: decisions.map((d) => ({ ...d, reason: '' })) },
      })
    writeFile(
      dir,
      'author-decisions.jsonl',
      [
        line('ch1:proofread', 'proofread', [{ id: '0', accept: false }]),
        line('ch1:proofread', 'proofread', [{ id: '0', accept: true }]),
        line('ch1:draft', 'draft_review', []),
      ].join('\n') + '\n',
    )
    expect(readSummaryInputs(dir).proofread?.['1']?.decisions).toEqual([{ id: '0', accept: true }])
  })

  it('skips a proofread chapter that has no decision line yet', () => {
    const dir = newDir()
    writeFile(
      dir,
      'chapters/01.proofread.json',
      JSON.stringify([{ source: 'ai', quote: '되요', replacement: '돼요', kind: 'spelling' }]),
    )
    expect(readSummaryInputs(dir)).not.toHaveProperty('proofread')
  })

  it('reads a recorded continuation failure from the attempt file', () => {
    const dir = newDir()
    writeFile(
      dir,
      'chapters/01.attempt-1.continue.json',
      JSON.stringify({
        kind: 'continue-failed',
        message: '이어쓰기 실패',
        reason: 'UNKNOWN',
        detail: 'fetch failed',
        failure: 'external-network',
      }),
    )
    const summary = buildRunSummary([call({})], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary.draft?.continueFailed).toEqual({
      total: 1,
      external: 1,
      byReason: { UNKNOWN: 1 },
      byChapter: { '1': 1 },
    })
  })

  it('has no draft block when no continuation failed', () => {
    const summary = buildRunSummary([call({})], newState(config), 'ko', readSummaryInputs(newDir()))
    expect(summary).not.toHaveProperty('draft')
  })
})

describe('continueFailureOf', () => {
  it('reads the continue-failed warning from a draft run row', () => {
    const output = {
      text: '첫 문단.',
      warnings: [
        {
          kind: 'continue-failed',
          reason: 'AI_LIMIT',
          detail: 'usage limit',
          message: '이어쓰기 실패',
        },
      ],
    }
    expect(continueFailureOf(output)).toEqual({ reason: 'AI_LIMIT', detail: 'usage limit' })
  })

  it('returns null for a row without the warning', () => {
    expect(continueFailureOf({ text: '첫 문단.' })).toBeNull()
    expect(continueFailureOf({ text: '첫 문단.', warnings: [] })).toBeNull()
    expect(continueFailureOf(null)).toBeNull()
  })
})

describe('recordContinueFailure', () => {
  /** The parts of RunContext it reads: a db whose select chain yields one run row, and the client. */
  function ctxWith(output: unknown, dir: string) {
    let taken = 0
    const chain = { from: () => chain, where: () => chain, limit: async () => [{ output }] }
    const client = {
      takeLastFailure: () => {
        taken += 1
        return null
      },
    }
    const ctx = { dir, db: { select: () => chain }, client } as unknown as RunContext
    return { ctx, taken: () => taken }
  }

  const warning = (reason: string, detail: string) => ({
    text: '첫 문단.',
    warnings: [{ kind: 'continue-failed', reason, detail, message: '이어쓰기 실패' }],
  })
  const file = (dir: string) => join(dir, 'chapters', '01.attempt-1.continue.json')

  it('writes the attempt file and pauses the run on an external limit', async () => {
    const dir = newDir()
    const { ctx, taken } = ctxWith(warning('AI_LIMIT', 'usage limit'), dir)
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).rejects.toBeInstanceOf(
      ExternalFailureError,
    )
    expect(taken()).toBe(1)
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      kind: 'continue-failed',
      reason: 'AI_LIMIT',
      failure: 'external-limit',
    })
  })

  it('records a model failure without pausing', async () => {
    const dir = newDir()
    const { ctx, taken } = ctxWith(warning('EMPTY', 'the continuation was empty'), dir)
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).resolves.toBeUndefined()
    expect(taken()).toBe(1)
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      reason: 'EMPTY',
      failure: 'model',
    })
  })

  it('writes nothing for a run row without the warning', async () => {
    const dir = newDir()
    const { ctx, taken } = ctxWith({ text: '첫 문단.' }, dir)
    await recordContinueFailure(ctx, 'run-1', 1, 1)
    expect(taken()).toBe(0)
    expect(existsSync(file(dir))).toBe(false)
  })

  it('a recorded failure is counted as continueFailed 1 in the summary', async () => {
    const dir = newDir()
    const { ctx } = ctxWith(warning('EMPTY', 'the continuation was empty'), dir)
    await recordContinueFailure(ctx, 'run-1', 1, 1)
    const summary = buildRunSummary([call({})], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary.draft?.continueFailed).toMatchObject({ total: 1, external: 0 })
  })
})
