import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// The draft step's stages (spec 7): the continuation failure is taken before the later stages, and
// each stage owns one file per attempt that a resumed draft starts over.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-stages-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string): void {
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
  })
}

async function open(dir: string, o: Parameters<typeof openRun>[1] = {}): Promise<OpenRun> {
  const ctx = await openRun(dir, o)
  opened.push(ctx)
  ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
  return ctx
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type Fault = { task: AiTaskName; error: () => unknown; times?: number }

/** FakeAiClient that fails the chosen tasks. A stream failure rejects `final`, as a real one does. */
function faultyClient(faults: Fault[], overrides: ConstructorParameters<typeof FakeAiClient>[0]) {
  const inner = new FakeAiClient(overrides)
  const hits = new Map<AiTaskName, number>()
  const fault = (task: AiTaskName): unknown => {
    const f = faults.find((candidate) => candidate.task === task)
    if (!f) return undefined
    const n = hits.get(task) ?? 0
    hits.set(task, n + 1)
    return n < (f.times ?? Number.POSITIVE_INFINITY) ? f.error() : undefined
  }
  const client: AiClient = {
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
  return client
}

// Short, with no paragraph over the sentence limit: the trim stage makes no call, the continuation
// is planned, and the repair finds nothing to flag.
const SHORT = '비가 내렸다. 그녀는 창가에 섰다.\n\n아무도 답하지 않았다.'

/** A 429 as the SDK raises it: an Error with a status. */
const tooManyRequests = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 })

// Short, and one paragraph runs over the sentence limit: the trim stage would make a call, and
// its takeLastFailure would discard a continuation failure that was still held.
const SHORT_OVERLONG = `${Array.from({ length: 6 }, (_, i) => `그녀는 ${i + 1}번째 문을 열었다.`).join(' ')}\n\n아무도 답하지 않았다.`

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8')

describe('draft step: continuation failure (finding 4)', () => {
  it('pauses on a 429 in the continuation before the trim stage can discard it', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = faultyClient([{ task: 'draft-continue', error: tooManyRequests }], {
      overrides: { 'draft-chapter': () => SHORT_OVERLONG },
    })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('paused-limit')
    expect(state.plan[state.cursor]).toBe('ch1:draft')
    expect(JSON.parse(read(dir, 'chapters/01.attempt-1.continue.json'))).toMatchObject({
      message: '이어쓰기 실패',
      failure: 'external-limit',
    })
    // The draft was not carried into the later stages with its short text.
    expect(existsSync(join(dir, 'chapters/01.attempt-1.md'))).toBe(false)
    const tasks = readCallRecords(dir).map((record) => record.task)
    expect(tasks).not.toContain('paragraph-trim')
    expect(tasks).not.toContain('draft-repair')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.trim.json'))).toBe(false)
  }, 120_000)
})

describe('draft step: stage files (finding 6)', () => {
  it('writes draft.raw.txt for every draft, also when no stage changes the text', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => SHORT } })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    expect(read(dir, 'chapters/01.attempt-1.draft.raw.txt')).toBe(
      read(dir, 'chapters/01.attempt-1.md'),
    )
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.trimmed.txt'))).toBe(false)
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.repaired.txt'))).toBe(false)
  }, 120_000)

  it('writes draft.raw.txt and draft.repaired.txt when only the repair changes the text', async () => {
    const dir = newDir()
    makeRun(dir)
    const sentence = '그녀는 낡은 열쇠를 쥐었다.'
    const text = `${Array.from({ length: 9 }, () => sentence).join(' ')}\n\n아무도 답하지 않았다.`
    const inner = new FakeAiClient({
      overrides: {
        'draft-chapter': () => text,
        'draft-repair': () => ({
          edits: [{ quote: sentence, replacement: '그녀는 열쇠를 꽉 쥐었다.' }],
        }),
      },
    })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')
    const raw = read(dir, 'chapters/01.attempt-1.draft.raw.txt')
    expect(raw).toContain(sentence)
    const repaired = read(dir, 'chapters/01.attempt-1.draft.repaired.txt')
    expect(repaired).not.toBe(raw)
    expect(repaired).toBe(read(dir, 'chapters/01.attempt-1.md'))
    expect(existsSync(join(dir, 'chapters/01.attempt-1.repaired.txt'))).toBe(false)
  }, 120_000)

  it('a resumed draft leaves no stage file of the abandoned one', async () => {
    const dir = newDir()
    makeRun(dir)
    // First draft: overlong paragraphs, so the trim stage writes its files; the repair then hits a
    // 429 and the run pauses.
    const first = faultyClient([{ task: 'draft-repair', error: tooManyRequests }], {})
    const ctx1 = await open(dir, { inner: first, autoAuthor: true })
    ctx1.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const paused = await runUntilBlocked(ctx1)
    expect(paused.status).toBe('paused-limit')
    const abandoned = read(dir, 'chapters/01.attempt-1.draft.raw.txt')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.trim.json'))).toBe(true)
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.trimmed.txt'))).toBe(true)
    await opened.pop()?.close()

    // Resumed draft: a different text with nothing to trim or repair.
    const ctx2 = await open(dir, {
      inner: new FakeAiClient({ overrides: { 'draft-chapter': () => SHORT } }),
      autoAuthor: true,
    })
    ctx2.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(ctx2)
    expect(done.status).toBe('done')

    const raw = read(dir, 'chapters/01.attempt-1.draft.raw.txt')
    expect(raw).not.toBe(abandoned)
    expect(raw).toBe(read(dir, 'chapters/01.attempt-1.md'))
    for (const stale of ['trim.json', 'draft.trimmed.txt', 'draft.repaired.txt']) {
      expect(existsSync(join(dir, `chapters/01.attempt-1.${stale}`))).toBe(false)
    }
  }, 120_000)
})

describe('draft step: repeated-word metric (finding 9)', () => {
  it('exempts the bible names in the draft review and in the final chapter metrics', async () => {
    const dir = newDir()
    makeRun(dir)
    const bible = loadBible('ko')
    const name = bible.characters.find((c) => c.main)!.name
    const text = Array.from({ length: 12 }, () => `${name}은 문을 닫았다.`).join(' ')
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => text } })
    const ctx = await open(dir, { inner, autoAuthor: true })
    const reviewed: string[][] = []
    ctx.autoAuthor = (p) => {
      if (p.kind === 'draft_review') reviewed.push(p.metrics.repeatedWords.map((hit) => hit.word))
      return fakeAnswer(p, bible)
    }
    const state = await runUntilBlocked(ctx)
    expect(state.status).toBe('done')

    // The name is repeated in the text, so it would be listed if it were not exempt.
    const raw = read(dir, 'chapters/01.attempt-1.draft.raw.txt')
    expect(raw.split(name).length - 1).toBeGreaterThanOrEqual(12)
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0]).not.toContain(name)
    const final = JSON.parse(read(dir, 'metrics/01.json')) as {
      repeatedWords: { word: string }[]
    }
    expect(final.repeatedWords.map((hit) => hit.word)).not.toContain(name)
  }, 120_000)
})
