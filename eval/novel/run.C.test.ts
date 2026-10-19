import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import type { AiTaskName } from '@/db/types'
import { chapters } from '@/db/schema'
import { foreignScriptRuns } from '@/ai/guards'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// Track C: the foreign-script repair in the eval draft step (spec 7). Helpers copied from
// run.draft-stages.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-c-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string, lang: 'ko' | 'en' = 'ko'): void {
  createRun(dir, {
    modelId: 'fake',
    lang,
    chapters: 1,
    questions: 2,
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

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8')

/** A 429 as the SDK raises it: an Error with a status. */
const tooManyRequests = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 })

// Clean Korean, 600+ characters, no paragraph over three sentences. The Han sentence stands alone.
const LONG_KO = [
  '비가 그친 아침, 서윤은 오래된 기숙사의 계단을 천천히 내려갔다. 난간에는 아직 물기가 남아 있었다. 그녀는 손끝으로 녹슨 쇠를 쓸어 보았다.',
  '복도 끝 창문으로 젖은 나뭇잎이 보였다. 누군가 밤사이 다녀간 흔적이었다. 바닥의 진흙에는 작은 발자국이 찍혀 있었다.',
  '그는 三楼 계단에 앉아 있었다.',
  '서윤은 편지를 다시 꺼내 날짜를 확인했다. 지난주에 받은 것과 같은 필체였다. 종이 가장자리는 이미 누렇게 변해 있었다.',
  '문득 아래층에서 문이 열리는 소리가 들렸다. 그녀는 숨을 죽이고 귀를 기울였다. 발소리는 곧 멀어졌다.',
  '서윤은 오래된 일기장을 떠올렸다. 그 안에는 기숙사에 살던 사람들의 이름이 적혀 있었다. 이번 편지의 필체는 그 가운데 한 사람과 닮아 있었다.',
  '계단을 다 내려왔을 때 현관 유리에 그녀의 얼굴이 비쳤다. 표정은 생각보다 침착했다. 서윤은 가방을 고쳐 메고 밖으로 걸음을 옮겼다.',
].join('\n\n')

// Short, no overlong paragraph: the trim stage makes no call and the repair finds nothing to flag.
const SHORT = '비가 내렸다. 그녀는 창가에 섰다.\n\n아무도 답하지 않았다.'

// Nine identical sentences make the repeated-word flags, so draft-repair is also called by E2.
const REPEATED = '그녀는 낡은 열쇠를 쥐었다.'
const WITH_HAN = `${Array.from({ length: 9 }, () => REPEATED).join(' ')} 그는 三楼 계단에 앉아 있었다.\n\n아무도 답하지 않았다.`
const HAN_SENTENCE = '그는 三楼 계단에 앉아 있었다.'
const FIXED_SENTENCE = '그는 계단에 앉아 있었다.'

async function savedBody(ctx: OpenRun, chapterId: string): Promise<string | undefined> {
  const [row] = await ctx.db.select().from(chapters).where(eq(chapters.id, chapterId))
  return row?.body
}

describe('draft step: foreign-script repair (ko)', () => {
  it('repairs Han before review and saves the clean text', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG_KO } })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    const attempt = read(dir, 'chapters/01.attempt-1.md')
    expect(foreignScriptRuns(attempt, 'ko')).toEqual([])
    expect(attempt).not.toContain('三楼')
    expect(read(dir, 'chapters/01.attempt-1.draft.raw.txt')).toContain('三楼')
    expect(read(dir, 'chapters/01.attempt-1.draft.foreign-repaired.txt')).toBe(attempt)
    expect(await savedBody(ctx, state.data.chapterIds[1])).toBe(attempt)
    expect(state.data.drafts[1][0].foreign).toEqual({ found: 1, replaced: 1, unresolved: 0 })

    const metrics = JSON.parse(read(dir, 'metrics/01.json')) as { foreignRuns: string[] }
    expect(metrics.foreignRuns).toEqual([])
    expect(foreignScriptRuns(read(dir, 'chapters/01.attempt-1.md'), 'ko')).toEqual([])

    const records = readCallRecords(dir).filter(
      (record) => record.task === 'draft-repair' && record.step === 'ch1:draft:foreign-repair',
    )
    expect(records).toHaveLength(1)
  }, 120_000)

  it('a failed repair keeps the raw draft and records the failure', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = faultyClient(
      [{ task: 'draft-repair', error: () => new AppError('AI_ERROR', 'x') }],
      { overrides: { 'draft-chapter': () => LONG_KO } },
    )
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    const raw = read(dir, 'chapters/01.attempt-1.draft.raw.txt')
    expect(read(dir, 'chapters/01.attempt-1.md')).toBe(raw)
    expect(await savedBody(ctx, state.data.chapterIds[1])).toBe(raw)
    expect(state.failed).toContainEqual(
      expect.objectContaining({ step: 'ch1:draft:foreign-repair' }),
    )
    expect(state.data.drafts[1][0].foreign).toEqual({ found: 1, replaced: 0, unresolved: 1 })
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.foreign-repaired.txt'))).toBe(false)
  }, 120_000)

  it('a resumed draft drops the stage file of the abandoned one', async () => {
    const dir = newDir()
    makeRun(dir)
    // First draft: the foreign-script repair writes its file, then the draft-repair of the repeated
    // word (E2) hits a 429 and the run pauses.
    const first = new FakeAiClient({
      overrides: {
        'draft-chapter': () => WITH_HAN,
        'draft-repair': (input) => {
          const { flags } = input as { flags: { kind: string }[] }
          if (flags.some((flag) => flag.kind === 'foreign-script')) {
            return { edits: [{ quote: HAN_SENTENCE, replacement: FIXED_SENTENCE }] }
          }
          throw tooManyRequests()
        },
      },
    })
    const ctx1 = await open(dir, { inner: first, autoAuthor: true })
    ctx1.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const paused = await runUntilBlocked(ctx1)
    expect(paused.status).toBe('paused-limit')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.foreign-repaired.txt'))).toBe(true)
    await opened.pop()?.close()

    // Resumed draft: a clean text, so no repair runs and nothing is left over.
    const ctx2 = await open(dir, {
      inner: new FakeAiClient({ overrides: { 'draft-chapter': () => SHORT } }),
      autoAuthor: true,
    })
    ctx2.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(ctx2)
    expect(done.status).toBe('done')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.foreign-repaired.txt'))).toBe(false)
  }, 120_000)
})

describe('draft step: foreign-script repair (en)', () => {
  it('is not run for an English run', async () => {
    const dir = newDir()
    makeRun(dir, 'en')
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG_KO } })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('en'))
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    const steps = readCallRecords(dir).map((record) => record.step ?? '')
    expect(steps.some((step) => step.endsWith(':foreign-repair'))).toBe(false)
    expect(state.data.drafts[1][0]).not.toHaveProperty('foreign')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.draft.foreign-repaired.txt'))).toBe(false)
  }, 120_000)
})
