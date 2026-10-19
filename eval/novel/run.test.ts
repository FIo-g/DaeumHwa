import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { FORMAT_MESSAGE } from '@/ai/anthropic'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { chapters, interviewSessions, proposals } from '@/db/schema'
import type { AiTaskName } from '@/db/types'
import { AppError } from '@/lib/errors'
import { MAX_PROOFREAD_AI_CHARS } from '@/server/chapter-check'
import { listNamingRules } from '@/server/naming'
import { listThreads } from '@/server/threads'
import { FakeAiClient } from '@/test/fake-ai'
import type { AuthorContext } from './author-context'
import { type Pending, readPending } from './author-io'
import { type Bible, loadBible } from './bible'
import { fakeAnswer } from './fake-author'
import { createRun, openRun, runUntilBlocked } from './run'
import { RunSummarySchema } from './steps/finish'
import { applySuggestions, pendingKey, selectDraftEntries } from './steps/util'
import type { RunState } from './state'

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-'))
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
  })
}

async function open(dir: string, o: Parameters<typeof openRun>[1] = {}): Promise<OpenRun> {
  const ctx = await openRun(dir, o)
  opened.push(ctx)
  return ctx
}

/** Closes the most recently opened run, as a process exit would. */
async function closeLast(): Promise<void> {
  const ctx = opened.pop()
  await ctx?.close()
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type Fault = { task: AiTaskName; error: () => unknown; times?: number }

/** FakeAiClient that throws the given error on chosen tasks. Stream failures reject `final`. */
function faultyClient(faults: Fault[]): AiClient {
  const inner = new FakeAiClient()
  const hits = new Map<AiTaskName, number>()
  const fault = (task: AiTaskName): unknown => {
    const f = faults.find((candidate) => candidate.task === task)
    if (!f) return undefined
    const n = hits.get(task) ?? 0
    hits.set(task, n + 1)
    return n < (f.times ?? Number.POSITIVE_INFINITY) ? f.error() : undefined
  }
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      const error = fault(args.task.name)
      if (error !== undefined) throw error
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      const error = fault(args.task.name)
      if (error !== undefined) {
        const textStream = (async function* () {})()
        return { textStream, final: Promise.reject(error) }
      }
      return inner.streamText(args)
    },
  }
}

/** FakeAiClient whose draft-chapter calls fail after the first `ok` ones succeed. */
function draftsFailingAfter(ok: number): AiClient {
  const inner = new FakeAiClient()
  let drafts = 0
  const failNow = (task: AiTaskName): boolean => {
    if (task !== 'draft-chapter') return false
    drafts += 1
    return drafts > ok
  }
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      if (!failNow(args.task.name)) return inner.streamText(args)
      const textStream = (async function* () {})()
      const error = new AppError('AI_ERROR', FORMAT_MESSAGE)
      return { textStream, final: Promise.reject(error) }
    },
  }
}

/** FakeAiClient whose chapter draft is longer than the proofreading limit. */
function longDraftClient(): AiClient {
  const inner = new FakeAiClient()
  const long = '가'.repeat(MAX_PROOFREAD_AI_CHARS + 1)
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      const result = inner.streamText(args)
      if (args.task.name !== 'draft-chapter') return result
      const textStream = (async function* () {
        yield long
      })()
      return { textStream, final: result.final.then((r) => ({ ...r, text: long })) }
    },
  }
}

function callFiles(dir: string): string[] {
  const calls = `${dir}/calls`
  return existsSync(calls) ? readdirSync(calls).sort() : []
}

function callsOf(dir: string, task: string): string[] {
  return callFiles(dir).filter((name) => name.endsWith(`-${task}.json`))
}

function decisionKinds(dir: string): string[] {
  return readFileSync(join(dir, 'author-decisions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => (JSON.parse(line) as { kind: string }).kind)
}

/**
 * Plays the author by hand: answers each pending item with fakeAnswer until one matches `stopAt`.
 * Returns the run state and the matching item (null when the run ends first).
 */
async function driveUntil(
  ctx: OpenRun,
  dir: string,
  bible: Bible,
  stopAt: (p: Pending) => boolean,
): Promise<{ state: RunState; pending: Pending | null }> {
  for (;;) {
    const state = await runUntilBlocked(ctx)
    if (state.status !== 'pending') return { state, pending: null }
    const pending = readPending(dir)
    if (!pending) throw new Error('run is pending but pending.json is missing')
    if (stopAt(pending)) return { state, pending }
    writeFileSync(join(dir, 'answer.json'), JSON.stringify(fakeAnswer(pending, bible)))
  }
}

function readAuthorContext(dir: string): AuthorContext {
  return JSON.parse(readFileSync(join(dir, 'author-context.json'), 'utf8')) as AuthorContext
}

describe('novel eval step machine', () => {
  it('fake run reaches done', async () => {
    const dir = newDir()
    makeRun(dir, 5, 12)
    const ctx = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    for (let n = 1; n <= 5; n++) {
      expect(existsSync(join(dir, 'chapters', `0${n}.md`))).toBe(true)
    }
    expect(existsSync(join(dir, 'wiki-final.json'))).toBe(true)
    expect(existsSync(join(dir, 'run-summary.json'))).toBe(true)
    const summary = JSON.parse(readFileSync(join(dir, 'run-summary.json'), 'utf8')) as {
      speed: {
        byTask: Record<string, { calls: number; medianFirstTokenMs: number | null }>
        overall: { source: string }
        perChapterMs: Record<string, number>
      }
    }
    expect(summary.speed.byTask['draft-chapter']?.calls).toBeGreaterThanOrEqual(1)
    expect(summary.speed.overall.source).toBe('wall')
    expect(typeof summary.speed.byTask['draft-chapter']?.medianFirstTokenMs).toBe('number')
    expect(summary.speed.perChapterMs['1']).toBeDefined()

    // Measurement blocks (HX5): the summary parses, the check step wrote the counters per chapter,
    // and the fake proofread returns no AI items, so the proofread block is absent.
    const parsed = RunSummarySchema.parse(summary)
    expect(parsed.timeouts).toEqual({ total: 0, byTask: {} })
    for (let n = 1; n <= 5; n++) {
      expect(existsSync(join(dir, 'chapters', `0${n}.extraction.json`))).toBe(true)
    }
    expect(parsed.extraction?.chapters).toBe(5)
    expect(parsed).not.toHaveProperty('proofread')

    const decisions = readFileSync(join(dir, 'author-decisions.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { kind: string })
    expect(decisions.filter((line) => line.kind === 'interview_answer')).toHaveLength(12)

    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.status === 'done')).toBe(true)

    const bible = loadBible('ko')
    const rules = await listNamingRules(ctx.db, ctx.actor, state.data.workId as string)
    const canonicals = rules.map((rule) => rule.canonical)
    expect(canonicals).toEqual(expect.arrayContaining(bible.namingRules.map((r) => r.canonical)))
    const threads = await listThreads(ctx.db, ctx.actor, state.data.workId as string)
    const titles = threads.map((thread) => thread.title)
    expect(titles).toEqual(expect.arrayContaining(bible.threads.map((t) => t.title)))
  }, 120_000)

  it('stops at pending without an author', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir)

    let state = await runUntilBlocked(ctx)
    expect(state.status).toBe('pending')
    const first = readPending(dir)
    expect(first?.kind).toBe('interview_answer')
    if (first?.kind !== 'interview_answer') throw new Error('expected an interview answer')

    writeFileSync(join(dir, 'answer.json'), JSON.stringify(fakeAnswer(first, bible)))
    state = await runUntilBlocked(ctx)
    expect(state.status).toBe('pending')
    const next = readPending(dir)
    expect(next).not.toBeNull()
    expect(next?.kind === 'interview_answer' && next.turnId === first.turnId).toBe(false)
  }, 120_000)

  it('writes author-context.json while waiting for a proposals judgment', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const ctx = await open(dir)
    const { pending } = await driveUntil(ctx, dir, loadBible('ko'), (p) => p.kind === 'proposals')
    if (pending?.kind !== 'proposals') throw new Error('expected a proposals wait')

    const context = readAuthorContext(dir)
    expect(context.pendingRef.key).toBe(pendingKey(pending))
    expect(context.pendingRef.itemIds).toEqual(pending.items.map((item) => item.id))
  }, 120_000)

  it('context shows a card approved earlier (end to end through the hook)', async () => {
    const dir = newDir()
    // With one chapter the first post-chapter batch is the first wait with a wiki, so it is empty.
    // The second chapter's batch sees the cards chapter 1 approved.
    makeRun(dir, 2, 2)
    const ctx = await open(dir)
    const { pending } = await driveUntil(
      ctx,
      dir,
      loadBible('ko'),
      (p) => p.kind === 'proposals' && p.source === 'post_chapter' && p.chapter === 2,
    )
    expect(pending).not.toBeNull()
    if (pending?.kind !== 'proposals') throw new Error('expected a proposals wait')

    const context = readAuthorContext(dir)
    expect(context.wiki.entries.length).toBeGreaterThanOrEqual(1)
    expect(context.decisions.approvedCount).toBeGreaterThan(0)
    expect(context.pendingRef.key).toBe(pendingKey(pending))
  }, 120_000)

  it('removes a stale author-context.json at a wait that needs none', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    writeFileSync(join(dir, 'author-context.json'), '{"stale": true}')
    const ctx = await open(dir)
    const { pending } = await driveUntil(
      ctx,
      dir,
      loadBible('ko'),
      (p) => p.kind === 'draft_review',
    )
    expect(pending?.kind).toBe('draft_review')
    expect(existsSync(join(dir, 'author-context.json'))).toBe(false)
  }, 120_000)

  it('leaves no author-context.json when the run is done', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const ctx = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    expect(existsSync(join(dir, 'author-context.json'))).toBe(false)
  }, 120_000)

  it('a failing context build does not stop the run', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    mkdirSync(join(dir, 'author-context.json'))
    const ctx = await open(dir)
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('pending')
  }, 120_000)

  it('external limit pauses and resumes', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const limited = faultyClient([
      {
        task: 'draft-chapter',
        error: () => ({ status: 429, message: 'Too Many Requests' }),
        times: 1,
      },
    ])
    const first = await open(dir, { inner: limited, autoAuthor: true })
    const paused = await runUntilBlocked(first)
    expect(paused.status).toBe('paused-limit')
    expect(paused.plan[paused.cursor]).toBe('ch1:draft')
    expect(paused.pauses['ch1:draft']).toBe(1)
    const seqBefore = paused.nextSeq
    const callsBefore = callFiles(dir)
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const done = await runUntilBlocked(second)
    expect(done.status).toBe('done')

    const newFiles = callFiles(dir).filter((name) => !callsBefore.includes(name))
    expect(newFiles.some((name) => name.endsWith('-interview-question.json'))).toBe(false)

    // Numbering starts wherever the run starts; it must only never skip or repeat.
    const seqs = callFiles(dir).map((name) => Number(name.slice(0, 3)))
    expect(seqs).toEqual(seqs.map((_, i) => seqs[0]! + i))
    expect(seqBefore).toBeGreaterThan(seqs[0]!)
  }, 120_000)

  it('three external pauses block', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    let status = ''
    for (let i = 0; i < 3; i++) {
      const inner = faultyClient([
        { task: 'draft-chapter', error: () => ({ status: 429, message: 'Too Many Requests' }) },
      ])
      const ctx = await open(dir, { inner, autoAuthor: true })
      status = (await runUntilBlocked(ctx)).status
      await closeLast()
    }
    expect(status).toBe('blocked')
  }, 120_000)

  it('model failure is recorded and skipped', async () => {
    const dir = newDir()
    makeRun(dir, 5, 2)
    const broken = faultyClient([
      {
        task: 'chapter-extract',
        error: () => new AppError('AI_ERROR', FORMAT_MESSAGE),
      },
    ])
    const ctx = await open(dir, { inner: broken, autoAuthor: true })
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    const checkFailures = state.failed.filter((entry) => entry.step.endsWith(':check'))
    expect(checkFailures.map((entry) => entry.step)).toEqual([
      'ch1:check',
      'ch2:check',
      'ch3:check',
      'ch4:check',
      'ch5:check',
    ])
    for (let n = 1; n <= 5; n++) {
      expect(state.retried[`ch${n}:check`]).toBe(1)
    }
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(5)
  }, 120_000)

  it('draft redo', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir, { autoAuthor: true })
    ctx.autoAuthor = (p) =>
      p.kind === 'draft_review' && p.attempt === 1
        ? { kind: 'draft_review', usable: false, quality: 1, reason: 'too short' }
        : fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    const attempt2 = readFileSync(join(dir, 'chapters', '01.attempt-2.md'), 'utf8')
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe(attempt2)
  }, 120_000)

  it('a failed redo keeps the earlier draft as the chapter', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir, { inner: draftsFailingAfter(1), autoAuthor: true })
    ctx.autoAuthor = (p) =>
      p.kind === 'draft_review' && p.attempt === 1
        ? { kind: 'draft_review', usable: false, quality: 1, reason: 'too short' }
        : fakeAnswer(p, bible)

    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    const attempt1 = readFileSync(join(dir, 'chapters', '01.attempt-1.md'), 'utf8')
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.body).toBe(attempt1)
    expect(state.failed).toEqual([expect.objectContaining({ step: 'ch1:draft' })])
    expect(state.data.chapterIds[1]).toBe(rows[0]?.id)
    // The later chapter steps still run on the saved chapter.
    expect(state.data.marks['ch1:proposals']).toBe(true)
  }, 120_000)

  it('skips the chapter with a recorded reason when no attempt produced text', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const ctx = await open(dir, { inner: draftsFailingAfter(0), autoAuthor: true })
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(0)
    expect(state.failed.map((entry) => `${entry.step}: ${entry.message}`)).toContain(
      'ch1:draft: no draft text',
    )
  }, 120_000)

  it('close puts back the daily token limit it changed', async () => {
    const before = process.env.AI_DAILY_TOKEN_LIMIT
    process.env.AI_DAILY_TOKEN_LIMIT = '777'
    try {
      const dir = newDir()
      makeRun(dir, 1, 2)
      await open(dir, { inner: new FakeAiClient() })
      expect(process.env.AI_DAILY_TOKEN_LIMIT).toBe('0')
      await closeLast()
      expect(process.env.AI_DAILY_TOKEN_LIMIT).toBe('777')
    } finally {
      if (before === undefined) delete process.env.AI_DAILY_TOKEN_LIMIT
      else process.env.AI_DAILY_TOKEN_LIMIT = before
    }
  }, 120_000)

  it('no duplicate chapter after a crash', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwAfter = 'ch1:chapter-created'
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    const rows = await second.db.select().from(chapters)
    expect(rows.map((row) => row.position)).toEqual([1])
  }, 120_000)

  it('resumes after a chapter commit that lost its mark, without a second draft', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwBeforeMark = (key) => key === 'ch1:chapter-created'
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    expect(await first.db.select().from(chapters)).toHaveLength(1)
    const callsBefore = callFiles(dir)
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    const rows = await second.db.select().from(chapters)
    expect(rows.map((row) => row.position)).toEqual([1])
    expect(existsSync(join(dir, 'chapters', '01.attempt-2.md'))).toBe(false)
    const newFiles = callFiles(dir).filter((name) => !callsBefore.includes(name))
    expect(newFiles.some((name) => name.endsWith('-draft-chapter.json'))).toBe(false)
  }, 120_000)

  it('resumes after an answer commit that lost its mark, without a new question', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwBeforeMark = (key) => key.startsWith('interview:') && key.endsWith(':answered')
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    expect(state.failed).toEqual([])
    // Two questions in total: the crashed turn was not asked again.
    expect(callsOf(dir, 'interview-question')).toHaveLength(2)
    expect(decisionKinds(dir).filter((kind) => kind === 'interview_answer')).toHaveLength(2)
  }, 120_000)

  it('resumes after a decision commit that lost its mark, without approving twice', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwBeforeMark = (key) => key.startsWith('decided:')
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    // A second approval would fail with BAD_STATE and be recorded here.
    expect(state.failed).toEqual([])
    const approved = await second.db
      .select()
      .from(proposals)
      .where(eq(proposals.status, 'approved'))
    expect(approved.length).toBeGreaterThan(0)
  }, 120_000)

  it('resumes after completing the interview commit that lost its mark', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwBeforeMark = (key) => key === 'interview:completed'
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    await closeLast()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    expect(state.failed).toEqual([])
    const [session] = await second.db.select().from(interviewSessions)
    expect(session?.status).toBe('completed')
  }, 120_000)

  it('records an over-long draft at proofread and still saves the chapter', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const ctx = await open(dir, { inner: longDraftClient(), autoAuthor: true })
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    expect(state.failed).toContainEqual(
      expect.objectContaining({
        step: 'ch1:proofread',
        message: expect.stringMatching(/^VALIDATION /),
      }),
    )
    const rows = await ctx.db.select().from(chapters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('done')
    expect(existsSync(join(dir, 'chapters', '01.md'))).toBe(true)
  }, 120_000)

  it('records a proposal that cannot be approved and applies the others', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const bible = loadBible('ko')
    const ctx = await open(dir)
    let refusedId: string | null = null
    let batch: string[] = []

    let state = await runUntilBlocked(ctx)
    while (state.status === 'pending') {
      const pending = readPending(dir)
      if (!pending) throw new Error('pending without pending.json')
      if (pending.kind === 'proposals' && refusedId === null && pending.items.length > 1) {
        // Break the first proposal's payload so the product refuses to approve it.
        refusedId = pending.items[0]?.id ?? null
        batch = pending.items.map((item) => item.id)
        await ctx.db
          .update(proposals)
          .set({ payload: {} })
          .where(eq(proposals.id, refusedId ?? ''))
      }
      writeFileSync(join(dir, 'answer.json'), JSON.stringify(fakeAnswer(pending, bible)))
      state = await runUntilBlocked(ctx)
    }

    expect(refusedId).not.toBeNull()
    expect(state.status).toBe('done')
    expect(state.failed).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/^VALIDATION /) }),
    )
    const rows = await ctx.db.select().from(proposals)
    const byId = new Map(rows.map((row) => [row.id, row.status]))
    expect(byId.get(refusedId ?? '')).toBe('pending')
    for (const id of batch.filter((other) => other !== refusedId)) {
      expect(byId.get(id)).toBe('approved')
    }
  }, 120_000)

  it('selectDraftEntries matches names and aliases', () => {
    const entries = [
      { id: '1', name: '한세린', aliases: ['세린'] },
      { id: '2', name: 'Baek', aliases: ['Jiwon'] },
      { id: '3', name: 'Ghost', aliases: [] },
    ]
    expect(selectDraftEntries(entries, '세린이 종루에 오른다. 한세린은 숨는다.')).toEqual(['1'])
    expect(selectDraftEntries(entries, 'JIWON meets baek at dawn')).toEqual(['2'])
    expect(selectDraftEntries(entries, '아무도 나오지 않는다')).toEqual([])
  })

  it('applySuggestions applies right to left, skips bad quotes and overlaps', () => {
    expect(
      applySuggestions('AAA BBB CCC', [
        { quote: 'AAA', replacement: 'a', start: 0, end: 3 },
        { quote: 'CCC', replacement: 'c', start: 8, end: 11 },
      ]),
    ).toBe('a BBB c')
    expect(
      applySuggestions('AAA BBB CCC', [{ quote: 'XXX', replacement: 'x', start: 4, end: 7 }]),
    ).toBe('AAA BBB CCC')
    expect(
      applySuggestions('abcdef', [
        { quote: 'bcd', replacement: 'X', start: 1, end: 4 },
        { quote: 'cde', replacement: 'Y', start: 2, end: 5 },
      ]),
    ).toBe('aXef')
  })
})
