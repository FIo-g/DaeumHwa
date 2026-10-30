import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORMAT_MESSAGE } from '@/ai/anthropic'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { aiRuns, chapters } from '@/db/schema'
import { overlongParagraphs } from '@/lib/korean/paragraphs'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// Track E1: the paragraph trim stage of the eval draft step. Helpers are copied from run.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-e1-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string, chapterCount: number, questions: number): void {
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: chapterCount,
    questions,
    maxDraftAttempts: 2,
    commit: 'test',
    // These tests cover the append continuation, so the run is made in continue mode.
    lengthMode: 'continue',
  })
}

async function open(dir: string, o: Parameters<typeof openRun>[1] = {}): Promise<OpenRun> {
  const ctx = await openRun(dir, o)
  opened.push(ctx)
  return ctx
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type Fault = { task: AiTaskName; error: () => unknown }

/** FakeAiClient that throws the given error on the chosen task, every time. */
function faultyClient(fault: Fault): AiClient {
  const inner = new FakeAiClient()
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      if (args.task.name === fault.task) throw fault.error()
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      return inner.streamText(args)
    },
  }
}

function readRun(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), 'utf8')
}

describe('eval draft paragraph trim (track E1)', () => {
  beforeEach(() => {
    vi.stubEnv('AI_DRAFT_LENGTH_MODE', 'continue')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('trims the overlong paragraphs before the saved chapter is written', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir, { inner: new FakeAiClient(), autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')

    const attempt1 = readRun(dir, 'chapters/01.attempt-1.md')
    const raw = readRun(dir, 'chapters/01.attempt-1.draft.raw.txt')
    const trimmed = readRun(dir, 'chapters/01.attempt-1.draft.trimmed.txt')
    expect(overlongParagraphs(raw).length).toBeGreaterThan(0)
    expect(overlongParagraphs(attempt1)).toEqual([])
    // The repair fake makes no edits, so the trimmed text is the final text.
    expect(trimmed).toBe(attempt1)

    const trim = JSON.parse(readRun(dir, 'chapters/01.attempt-1.trim.json')) as {
      status: string
      before: number
      after: number
    }
    expect(trim.status).toBe('ok')
    expect(trim.before).toBeGreaterThan(trim.after)

    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe(attempt1)
  }, 120_000)

  it('keeps the raw draft and records a failed trim when the trim call fails with a format error', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir, {
      inner: faultyClient({
        task: 'paragraph-trim',
        error: () => new AppError('AI_ERROR', FORMAT_MESSAGE),
      }),
      autoAuthor: true,
    })
    ctx.autoAuthor = (p) => fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')

    // No stage file is written when the trim fails, so the attempt file is the raw draft.
    const raw = readRun(dir, 'chapters/01.attempt-1.md')
    expect(overlongParagraphs(raw).length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.trimmed.txt'))).toBe(false)
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe(raw)

    expect(state.failed).toEqual([expect.objectContaining({ step: 'ch1:draft:paragraphs' })])
    expect(state.retried['ch1:draft:paragraphs']).toBe(1)

    const trim = JSON.parse(readRun(dir, 'chapters/01.attempt-1.trim.json')) as {
      status: string
      before: number
      after: number
    }
    expect(trim.status).toBe('failed')
    expect(trim.after).toBe(trim.before)
    expect(state.data.drafts[1]).toHaveLength(1)
  }, 120_000)

  it('makes no trim call and writes no trim.json when no paragraph is overlong', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const short = '비가 내렸다. 그녀는 창가에 섰다.\n\n아무도 답하지 않았다.'
    const ctx = await open(dir, {
      inner: new FakeAiClient({ overrides: { 'draft-chapter': () => short } }),
      autoAuthor: true,
    })
    ctx.autoAuthor = (p) => fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.trim.json'))).toBe(false)
    // The raw file is written for every draft, so it holds the attempt's text here.
    expect(readRun(dir, 'chapters/01.attempt-1.draft.raw.txt')).toBe(
      readRun(dir, 'chapters/01.attempt-1.md'),
    )
    expect(readCallRecords(dir).some((record) => record.task === 'paragraph-trim')).toBe(false)
  }, 120_000)

  it('stores the trimmed text in the draft run record even when the repair call fails', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir, {
      inner: faultyClient({
        task: 'draft-repair',
        error: () => new AppError('AI_ERROR', FORMAT_MESSAGE),
      }),
      autoAuthor: true,
    })
    ctx.autoAuthor = (p) => fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    // The repair call was made and failed; the failure is recorded, not swallowed.
    expect(state.failed).toContainEqual(expect.objectContaining({ step: 'ch1:draft:repair' }))
    expect(readCallRecords(dir).some((record) => record.task === 'draft-repair')).toBe(true)

    const trimmed = readRun(dir, 'chapters/01.attempt-1.draft.trimmed.txt')
    expect(readRun(dir, 'chapters/01.attempt-1.md')).toBe(trimmed)
    const [draftRun] = await ctx.db.select().from(aiRuns).where(eq(aiRuns.task, 'draft-chapter'))
    expect((draftRun?.output as { text: string }).text).toBe(trimmed)
  }, 120_000)
})
