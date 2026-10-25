import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { FakeAiClient } from '@/test/fake-ai'
import { createRun, openRun, runUntilBlocked } from './run'

// The eval keeps the speech feature off (comparability with the 2026-10-18 baseline) even when a
// developer turned the product flag on in .env.local.

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

/** FakeAiClient that records the system prompt of every interview-question call. */
function recordingClient(systems: string[]): AiClient {
  const inner = new FakeAiClient()
  return {
    provider: 'test',
    defaultModel: 'fake',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      if (args.task.name === 'interview-question') systems.push(args.system)
      return inner.generateObject(args)
    },
    streamText(args: StreamTextArgs) {
      if (args.task.name === 'interview-question') systems.push(args.system)
      return inner.streamText(args)
    },
  }
}

describe('openRun speech flag', () => {
  it('forces AI_SPEECH_STYLE off during the run and restores it on close', async () => {
    process.env.AI_SPEECH_STYLE = 'on'
    const dir = mkdtempSync(join(tmpdir(), 'novel-speech-'))
    dirs.push(dir)
    createRun(dir, {
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 2,
      maxDraftAttempts: 2,
      commit: 'test',
    })
    const systems: string[] = []
    const ctx = await openRun(dir, { inner: recordingClient(systems), autoAuthor: true })
    try {
      expect(process.env.AI_SPEECH_STYLE).toBe('off')
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }

    expect(systems.length).toBeGreaterThan(0)
    for (const system of systems) expect(system).not.toContain('말투 없음')
    expect(process.env.AI_SPEECH_STYLE).toBe('on')
  })

  it('leaves the variable unset after close when it was unset before', async () => {
    delete process.env.AI_SPEECH_STYLE
    const dir = mkdtempSync(join(tmpdir(), 'novel-speech-'))
    dirs.push(dir)
    createRun(dir, {
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 1,
      maxDraftAttempts: 2,
      commit: 'test',
    })
    const ctx = await openRun(dir, { inner: new FakeAiClient() })
    expect(process.env.AI_SPEECH_STYLE).toBe('off')
    await ctx.close()
    expect('AI_SPEECH_STYLE' in process.env).toBe(false)
  })
})
