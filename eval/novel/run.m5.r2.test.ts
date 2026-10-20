import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { FakeAiClient } from '@/test/fake-ai'
import type { ContinuityInput, ContinuityOutput } from '@/ai/tasks/continuity-check'
import { loadBible, RUN_BIBLE_FILE } from './bible'
import { fakeAnswer } from './fake-author'
import { blindCallRecord, writeBlindCopy } from './blind'
import { readCallRecords } from './steps/util'
import { createRun, openRun, runUntilBlocked } from './run'

// Round 2 track M5 parts a and b: --speech on run behaviour (env flag, interview rules, bible copy)
// and --two-step on for cloud profiles (beat list, scene rewrite, no foreign-script repair).

const dirs: string[] = []
let saved: string | undefined

beforeEach(() => {
  saved = process.env.AI_SPEECH_STYLE
})

afterEach(() => {
  if (saved === undefined) delete process.env.AI_SPEECH_STYLE
  else process.env.AI_SPEECH_STYLE = saved
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-m5-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string, o: { speech?: boolean } = {}): void {
  createRun(dir, {
    modelId: 'haiku-5.5',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...o,
  })
}

/** FakeAiClient that records the system prompts of the interview question and extract calls. */
function recordingClient(questions: string[], extracts: string[]): AiClient {
  const inner = new FakeAiClient()
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      if (args.task.name === 'interview-question') questions.push(args.system)
      if (args.task.name === 'interview-extract') extracts.push(args.system)
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      if (args.task.name === 'interview-question') questions.push(args.system)
      if (args.task.name === 'interview-extract') extracts.push(args.system)
      return inner.streamText(args)
    },
  }
}

describe('openRun speech flag (M5)', () => {
  it('sets AI_SPEECH_STYLE on for a speech run and restores the unset value', async () => {
    delete process.env.AI_SPEECH_STYLE
    const dir = newDir()
    makeRun(dir, { speech: true })
    const ctx = await openRun(dir, { inner: new FakeAiClient() })
    try {
      expect(process.env.AI_SPEECH_STYLE).toBe('on')
    } finally {
      await ctx.close()
    }
    expect(process.env.AI_SPEECH_STYLE).toBeUndefined()
  }, 120_000)

  it('restores a previous value after a speech run', async () => {
    process.env.AI_SPEECH_STYLE = '1'
    const dir = newDir()
    makeRun(dir, { speech: true })
    const ctx = await openRun(dir, { inner: new FakeAiClient() })
    await ctx.close()
    expect(process.env.AI_SPEECH_STYLE).toBe('1')
  }, 120_000)

  it('keeps the feature off for a plain run even when the env is on', async () => {
    process.env.AI_SPEECH_STYLE = 'on'
    const dir = newDir()
    makeRun(dir)
    const ctx = await openRun(dir, { inner: new FakeAiClient() })
    try {
      expect(process.env.AI_SPEECH_STYLE).toBe('')
    } finally {
      await ctx.close()
    }
  }, 120_000)
})

describe('speech run content (M5)', () => {
  it('asks the interview with the speech rules', async () => {
    const dir = newDir()
    makeRun(dir, { speech: true })
    const questions: string[] = []
    const extracts: string[] = []
    const ctx = await openRun(dir, {
      inner: recordingClient(questions, extracts),
      autoAuthor: true,
    })
    try {
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    expect(questions.length).toBeGreaterThan(0)
    for (const system of questions) expect(system).toContain('말투 없음')
    expect(extracts.length).toBeGreaterThan(0)
    for (const system of extracts) expect(system).toContain('key "speech"')
  }, 120_000)

  it('uses the copy as its bible', async () => {
    const speechDir = newDir()
    makeRun(speechDir, { speech: true })
    const speech = await openRun(speechDir, { inner: new FakeAiClient() })
    try {
      const answer = speech.bible.answerBank.find((item) => item.key === 'protagonist')?.answer
      expect(answer).toContain('한세린 말투:')
    } finally {
      await speech.close()
    }

    const plainDir = newDir()
    makeRun(plainDir)
    const plain = await openRun(plainDir, { inner: new FakeAiClient() })
    try {
      const answer = plain.bible.answerBank.find((item) => item.key === 'protagonist')?.answer
      expect(answer).not.toContain('말투:')
    } finally {
      await plain.close()
    }
    const fixture = loadBible('ko').answerBank.find((item) => item.key === 'protagonist')
    expect(fixture?.answer).not.toContain('말투:')
  }, 120_000)

  it('stops with an error when a speech run has no bible copy', async () => {
    const dir = newDir()
    makeRun(dir, { speech: true })
    rmSync(join(dir, RUN_BIBLE_FILE))
    await expect(openRun(dir, { inner: new FakeAiClient() })).rejects.toThrow(/bible\.json/)
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(false)
    expect(readFileSync(join(dir, 'config.json'), 'utf8')).toContain('"speech": true')
  }, 120_000)
})

describe('blind copy of a speech run (M5)', () => {
  it('keeps the speech key out of the blinded call records and the copy', async () => {
    const dir = newDir()
    makeRun(dir, { speech: true })
    const ctx = await openRun(dir, { inner: recordingClient([], []), autoAuthor: true })
    try {
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }

    const records = readCallRecords(dir)
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(blindCallRecord(record)).not.toHaveProperty('speech')
    }

    const blindDir = newDir()
    const out = join(blindDir, 'blind')
    writeBlindCopy(dir, { out, repoRoot: process.cwd() })
    expect(existsSync(join(out, 'config.json'))).toBe(false)
    const copied = readCallRecords(out) as Array<Record<string, unknown>>
    expect(copied.length).toBe(records.length)
    for (const record of copied) {
      expect(record).not.toHaveProperty('speech')
    }
  }, 120_000)
})

// Round 2 track M5 part b: --two-step on. Helpers copied from run.D.test.ts and run.C.test.ts.

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

// The Han sentence of run.C.test.ts, inside otherwise clean Korean.
const LONG_WITH_HAN = `${LONG_KO}\n\n그는 三楼 계단에 앉아 있었다.`

/** One high issue on the quote, with a complete suggestion. Empty while chapter 1 is checked. */
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

function makeCloudRun(dir: string, o: { twoStep?: boolean; chapters?: number } = {}): void {
  createRun(dir, {
    modelId: 'haiku-5.5',
    lang: 'ko',
    chapters: o.chapters ?? 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    // The beat list of these tests is the pre-stage-1 path: no plan card.
    quick: true,
    ...(o.twoStep ? { twoStep: true } : {}),
  })
}

const stepsOf = (dir: string) => readCallRecords(dir).map((record) => record.step)

describe('--two-step on for a cloud profile (M5)', () => {
  it('makes the beat list before the prose', async () => {
    const dir = newDir()
    makeCloudRun(dir, { twoStep: true })
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG_KO } })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    try {
      const state = await runUntilBlocked(ctx)
      expect(state.status).toBe('done')
    } finally {
      await ctx.close()
    }
    expect(readCallRecords(dir).map((record) => record.task)).toContain('draft-beats')
    const beats = JSON.parse(
      readFileSync(join(dir, 'chapters/01.attempt-1.beats.json'), 'utf8'),
    ) as {
      scenes: unknown[]
    }
    expect(beats.scenes.length).toBeGreaterThan(0)
  }, 120_000)

  it('rewrites the scene of an accepted high issue', async () => {
    const dir = newDir()
    makeCloudRun(dir, { twoStep: true, chapters: 2 })
    const inner = new FakeAiClient({
      overrides: { 'draft-chapter': () => LONG_KO, 'continuity-check': highIssue },
    })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    let state
    try {
      state = await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    expect(state.status).toBe('done')
    expect(readCallRecords(dir).map((record) => record.task)).toContain('scene-rewrite')
    expect(readFileSync(join(dir, 'chapters/02.pre-rewrite.md'), 'utf8')).toContain(QUOTE)
    expect(readFileSync(join(dir, 'chapters/02.md'), 'utf8')).toContain(FIX)
    expect(existsSync(join(dir, 'rewrites/02.json'))).toBe(true)
    expect(state.data.marks['ch2:continuity:rewritten']).toBe(true)
  }, 120_000)

  it('leaves the foreign-script repair off', async () => {
    const dir = newDir()
    makeCloudRun(dir, { twoStep: true })
    const inner = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG_WITH_HAN } })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    let state
    try {
      state = await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    expect(stepsOf(dir).some((step) => String(step).endsWith(':foreign-repair'))).toBe(false)
    expect(state.data.drafts[1][0]).not.toHaveProperty('foreign')
    expect(readFileSync(join(dir, 'chapters/01.attempt-1.md'), 'utf8')).toContain('三楼')
  }, 120_000)

  it('makes no beat list or rewrite without the option', async () => {
    const dir = newDir()
    makeCloudRun(dir)
    const inner = new FakeAiClient({
      overrides: { 'draft-chapter': () => LONG_KO, 'continuity-check': highIssue },
    })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    try {
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    const tasks = readCallRecords(dir).map((record) => record.task)
    expect(tasks).not.toContain('draft-beats')
    expect(tasks).not.toContain('scene-rewrite')
  }, 120_000)
})
