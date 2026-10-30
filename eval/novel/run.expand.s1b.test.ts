import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import type { CallRecord } from './eval-client'
import { fakeAnswer } from './fake-author'
import { initRun, lengthModeFlag } from './cli'
import { loadBible } from './bible'
import { harnessSummary } from './harness-summary'
import { MODEL_PROFILES, type ModelPrice } from './models'
import { createRun, openRun, runUntilBlocked } from './run'
import { loadConfig } from './state'
import { readCallRecords } from './steps/util'

// Length mode of the eval (stage 1b): a short draft is expanded by default, and `--length-mode continue`
// keeps the append continuation. The flag is stored in the run config, like the other init flags.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-expand-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// Short, with no break line: the draft is below the length target, so the draft step fills it.
const SHORT = '비가 내렸다. 그녀는 창가에 섰다.\n\n아무도 답하지 않았다.'

// A longer rewrite of the short draft; the fake answers the expansion with it.
const GROWN = '빗방울이 유리창을 타고 천천히 흘러내렸다. 그녀는 숨을 고르며 창가에 오래 서 있었다.'

function makeRun(dir: string, lengthMode?: 'continue'): void {
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    lengthMode,
  })
}

/** Runs chapter 1 with a short first draft and returns the call tasks it made. */
async function chapterTasks(dir: string): Promise<string[]> {
  const inner = new FakeAiClient({
    overrides: { 'draft-chapter': () => SHORT, 'draft-expand': () => GROWN },
  })
  const ctx = await openRun(dir, { inner, autoAuthor: true })
  opened.push(ctx)
  ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
  await runUntilBlocked(ctx)
  return readCallRecords(dir).map((record) => record.task)
}

describe('length mode flag (stage 1b)', () => {
  it('stores continue as lengthMode in the run config', () => {
    const root = newDir()
    const { dir } = initRun({
      model: 'fake',
      lang: 'ko',
      dir: join(root, 'c'),
      lengthMode: 'continue',
    })
    expect(loadConfig(dir).lengthMode).toBe('continue')
  })

  it('leaves lengthMode absent for a default run, which expands', () => {
    const root = newDir()
    const { dir } = initRun({ model: 'fake', lang: 'ko', dir: join(root, 'd') })
    expect(loadConfig(dir).lengthMode).toBeUndefined()
  })

  it('refuses an existing run made with another length mode', () => {
    const root = newDir()
    const dir = join(root, 'e')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', dir, lengthMode: 'continue' })).toThrow(
      `run exists with another length mode: ${dir}`,
    )
  })

  it('reads the --length-mode value: continue, absent, or an error for a bare flag', () => {
    expect(lengthModeFlag({ 'length-mode': 'continue' })).toBe('continue')
    expect(lengthModeFlag({})).toBeUndefined()
    expect(() => lengthModeFlag({ 'length-mode': true })).toThrow('unknown length mode: true')
  })
})

describe('draft step length mode (stage 1b)', () => {
  it('expands a short draft and makes no continuation call', async () => {
    const dir = newDir()
    makeRun(dir)
    const tasks = await chapterTasks(dir)
    expect(tasks).toContain('draft-expand')
    expect(tasks).not.toContain('draft-continue')
  }, 120_000)

  it('makes the continuation call and no expansion with continue', async () => {
    const dir = newDir()
    makeRun(dir, 'continue')
    const tasks = await chapterTasks(dir)
    expect(tasks).toContain('draft-continue')
    expect(tasks).not.toContain('draft-expand')
  }, 120_000)
})

describe('harness expansion calls (stage 1b)', () => {
  const price = MODEL_PROFILES['haiku-5.5'].price as ModelPrice

  /** A call record with only the fields the harness reads. */
  function call(seq: number, task: string, o: Partial<CallRecord> = {}) {
    return {
      seq,
      task,
      step: 'ch1:draft',
      kind: 'object',
      durationMs: 1000,
      firstTokenMs: null,
      usage: { inputTokens: 100, outputTokens: 10 },
      ...o,
    } as unknown as CallRecord
  }

  it('counts expansion calls per chapter and keeps their time in the write time', () => {
    const records = [
      call(1, 'draft-chapter', { kind: 'stream', durationMs: 20000, firstTokenMs: 1200 }),
      call(2, 'draft-expand', { durationMs: 3000 }),
      call(3, 'draft-expand', { durationMs: 4000 }),
    ]
    const summary = harnessSummary(records, {
      chapters: 1,
      drafts: {},
      instructions: () => '',
      price,
      settings: 'eval',
    })
    expect(summary.chapters[0]).toMatchObject({ expandCalls: 2, writeMs: 27000 })
  })
})
