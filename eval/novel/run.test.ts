import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FORMAT_MESSAGE } from '@/ai/anthropic'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { chapters } from '@/db/schema'
import { listNamingRules } from '@/server/naming'
import { listThreads } from '@/server/threads'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'
import { readPending } from './author-io'
import { loadBible } from './bible'
import { fakeAnswer } from './fake-author'
import { createRun, openRun, runUntilBlocked } from './run'

type OpenRun = Awaited<ReturnType<typeof openRun>>
import { selectDraftEntries, applySuggestions } from './steps/util'

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

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
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

function callFiles(dir: string): string[] {
  const calls = `${dir}/calls`
  return existsSync(calls) ? readdirSync(calls).sort() : []
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
    const seqBefore = paused.nextSeq
    const callsBefore = callFiles(dir)
    await first.close()
    opened.pop()

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
      await ctx.close()
      opened.pop()
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

  it('no duplicate chapter after a crash', async () => {
    const dir = newDir()
    makeRun(dir, 1, 2)
    const first = await open(dir, { autoAuthor: true })
    first.throwAfter = 'ch1:chapter-created'
    const crashed = await runUntilBlocked(first)
    expect(crashed.status).toBe('paused-error')
    await first.close()
    opened.pop()

    const second = await open(dir, { autoAuthor: true })
    const state = await runUntilBlocked(second)
    expect(state.status).toBe('done')
    const rows = await second.db.select().from(chapters)
    expect(rows.map((row) => row.position)).toEqual([1])
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
