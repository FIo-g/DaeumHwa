import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { FakeAiClient } from '@/test/fake-ai'
import { loadBible, RUN_BIBLE_FILE } from './bible'
import { blindCallRecord, writeBlindCopy } from './blind'
import { readCallRecords } from './steps/util'
import { createRun, openRun, runUntilBlocked } from './run'

// Round 2 track M5 part a: --speech on run behaviour (env flag, interview rules, bible copy).

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
