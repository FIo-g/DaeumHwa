import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContinuityInput, ContinuityOutput } from '@/ai/tasks/continuity-check'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// Track D: the beat list and the scene rewrite in the eval chapter steps (spec 7, local profiles
// only). Helpers copied from run.C.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-d-'))
  dirs.push(dir)
  return dir
}

function makeRun(
  dir: string,
  lang: 'ko' | 'en' = 'ko',
  modelId: 'qwen3.8-27b' | 'haiku-5.5' = 'qwen3.8-27b',
  chapters = 1,
): void {
  createRun(dir, {
    modelId,
    lang,
    chapters,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    // The beat list of these tests is the pre-stage-1 path: no plan card.
    quick: true,
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

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8')
const exists = (dir: string, rel: string) => existsSync(join(dir, rel))
const tasksOf = (dir: string) => readCallRecords(dir).map((record) => record.task)

// Clean Korean, 600+ characters, no paragraph over three sentences, no foreign script.
const QUOTE = '비가 그친 아침, 한세린은 오래된 기숙사의 계단을 천천히 내려갔다.'
const FIX = '비가 그친 아침, 한세린은 오래된 기숙사의 계단을 조용히 내려갔다.'
const LONG_KO = [
  `${QUOTE} 난간에는 아직 물기가 남아 있었다. 그녀는 손끝으로 녹슨 쇠를 쓸어 보았다.`,
  '복도 끝 창문으로 젖은 나뭇잎이 보였다. 누군가 밤사이 다녀간 흔적이었다. 바닥의 진흙에는 작은 발자국이 찍혀 있었다.',
  '한세린은 편지를 다시 꺼내 날짜를 확인했다. 지난주에 받은 것과 같은 필체였다. 종이 가장자리는 이미 누렇게 변해 있었다.',
  '문득 아래층에서 문이 열리는 소리가 들렸다. 그녀는 숨을 죽이고 귀를 기울였다. 발소리는 곧 멀어졌다.',
  '한세린은 오래된 일기장을 떠올렸다. 그 안에는 기숙사에 살던 사람들의 이름이 적혀 있었다. 이번 편지의 필체는 그 가운데 한 사람과 닮아 있었다.',
  '계단을 다 내려왔을 때 현관 유리에 그녀의 얼굴이 비쳤다. 표정은 생각보다 침착했다. 한세린은 가방을 고쳐 메고 밖으로 걸음을 옮겼다.',
].join('\n\n')

/**
 * One high issue on the first sentence, with a real quote, entry ref and a complete suggestion.
 * The wiki is empty while chapter 1 is checked (the first approved proposals come after it), so the
 * issue is raised for chapter 2.
 */
function highIssue(input: unknown): ContinuityOutput {
  const { pack } = input as ContinuityInput
  if (pack.entries.length === 0) return { issues: [] }
  const entry = pack.entries.find((e) => e.name === '한세린') ?? pack.entries[0]
  return {
    issues: [
      {
        quote: QUOTE,
        kind: 'contradiction',
        severity: 'high',
        factRef: entry.facts[0]?.ref ?? null,
        entryRef: entry.ref,
        wikiExcerpt: entry.facts[0]?.content ?? entry.summary,
        explanation: '위키와 어긋납니다.',
        suggestion: FIX,
      },
    ],
  }
}

async function runLocal(dir: string, modelId: 'qwen3.8-27b' | 'haiku-5.5') {
  makeRun(dir, 'ko', modelId, 2)
  const inner = new FakeAiClient({
    overrides: {
      'draft-chapter': () => LONG_KO,
      'draft-expand': NO_EXPANSION,
      'continuity-check': highIssue,
    },
  })
  const ctx = await open(dir, { inner, autoAuthor: true })
  ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
  return { ctx, state: await runUntilBlocked(ctx) }
}

// Expansion fails in these tests, as before the fake answered draft-expand: they plant text
// that an accepted expansion would rewrite.
const NO_EXPANSION = () => {
  throw new Error('no expansion in this test')
}

describe('draft beats (local profile)', () => {
  it('makes the beat list first and keeps it next to the attempt', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = new FakeAiClient({
      overrides: { 'draft-chapter': () => LONG_KO, 'draft-expand': NO_EXPANSION },
    })
    const ctx = await open(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const state = await runUntilBlocked(ctx)

    expect(state.status).toBe('done')
    expect(tasksOf(dir)).toContain('draft-beats')
    const beats = JSON.parse(read(dir, 'chapters/01.attempt-1.beats.json')) as { scenes: unknown[] }
    expect(beats.scenes.length).toBeGreaterThan(0)
  }, 120_000)
})

describe('scene rewrite (local profile)', () => {
  it('rewrites the scene of an accepted high issue and keeps the first copies', async () => {
    const dir = newDir()
    const { ctx, state } = await runLocal(dir, 'qwen3.8-27b')

    expect(state.status).toBe('done')
    expect(tasksOf(dir)).toContain('scene-rewrite')
    const before = read(dir, 'chapters/02.pre-rewrite.md')
    expect(before).toContain(QUOTE)
    const after = read(dir, 'chapters/02.md')
    expect(after).not.toContain(QUOTE)
    expect(after).toContain(FIX)
    expect(exists(dir, 'metrics/02.pre-rewrite.json')).toBe(true)
    const record = JSON.parse(read(dir, 'rewrites/02.json')) as {
      rewritten: { issueIds: string[] }[]
      skipped: unknown[]
    }
    expect(record.rewritten).toHaveLength(1)
    expect(record.skipped).toEqual([])
    expect(state.data.marks['ch2:continuity:rewritten']).toBe(true)
    void ctx
  }, 120_000)

  it('a resumed rewrite keeps the first copies and the record of the first call', async () => {
    const dir = newDir()
    makeRun(dir, 'ko', 'qwen3.8-27b', 2)
    const inner = new FakeAiClient({
      overrides: {
        'draft-chapter': () => LONG_KO,
        'draft-expand': NO_EXPANSION,
        'continuity-check': highIssue,
      },
    })
    const first = await open(dir, { inner, autoAuthor: true })
    first.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    // The rewrite is saved and its files are written, then the run stops before the mark.
    first.throwBeforeMark = (key) => key === 'ch2:continuity:rewritten'
    const paused = await runUntilBlocked(first)
    expect(paused.status).not.toBe('done')
    const pre = read(dir, 'chapters/02.pre-rewrite.md')
    const record = read(dir, 'rewrites/02.json')
    const rewrites = tasksOf(dir).filter((task) => task === 'scene-rewrite')
    expect(rewrites).toHaveLength(1)
    await opened.pop()?.close()

    const second = await open(dir, { inner, autoAuthor: true })
    second.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(second)

    expect(done.status).toBe('done')
    expect(read(dir, 'chapters/02.pre-rewrite.md')).toBe(pre)
    expect(read(dir, 'rewrites/02.json')).toBe(record)
    expect(read(dir, 'chapters/02.md')).toContain(FIX)
    expect(tasksOf(dir).filter((task) => task === 'scene-rewrite')).toHaveLength(1)
    expect(done.data.marks['ch2:continuity:rewritten']).toBe(true)
  }, 120_000)
})

describe('beats and scene rewrite (cloud profile)', () => {
  it('make no draft-beats or scene-rewrite call and no files', async () => {
    const dir = newDir()
    const { state } = await runLocal(dir, 'haiku-5.5')

    expect(state.status).toBe('done')
    const tasks = tasksOf(dir)
    expect(tasks).not.toContain('draft-beats')
    expect(tasks).not.toContain('scene-rewrite')
    expect(exists(dir, 'chapters/01.attempt-1.beats.json')).toBe(false)
    expect(exists(dir, 'chapters/02.attempt-1.beats.json')).toBe(false)
    expect(exists(dir, 'chapters/02.pre-rewrite.md')).toBe(false)
    expect(exists(dir, 'rewrites/02.json')).toBe(false)
    // The accepted high issue is still recorded; only the rewrite is left out.
    expect(read(dir, 'chapters/02.md')).toContain(QUOTE)
  }, 120_000)
})
