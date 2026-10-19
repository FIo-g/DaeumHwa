import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiClient, AiUsage } from '@/ai/types'
import { createRun, openRun } from './run'
import type { PowerInfo } from './power'
import { readCallRecords } from './steps/util'

// Power pass-through from openRun to the eval client (track M1). Helpers copied from run.D.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }
const USAGE: AiUsage = { inputTokens: 1, outputTokens: 1 }

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-m1-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string, modelId: 'qwen3.8-27b' | 'haiku-5.5' = 'qwen3.8-27b'): void {
  createRun(dir, {
    modelId,
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
  return ctx
}

/** Answers every object call with an empty suggestion list. */
const stub: AiClient = {
  provider: 'stub',
  defaultModel: 'stub',
  async generateObject<T>() {
    return { object: { suggestions: [] } as T, usage: USAGE, model: 'stub' }
  },
  streamText() {
    throw new Error('streamText is not used here')
  },
}

async function oneCall(ctx: OpenRun): Promise<void> {
  await ctx.client.generateObject({
    task: { name: 'proofread', input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  })
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

describe('openRun power', () => {
  it('openRun gives a local client the reader', async () => {
    const dir = newDir()
    makeRun(dir)
    const ctx = await open(dir, { inner: stub, readPower: () => LOW })
    await oneCall(ctx)
    expect(readCallRecords(dir)[0]?.power).toEqual(LOW)
  })

  it('openRun leaves cloud records alone', async () => {
    const dir = newDir()
    makeRun(dir, 'haiku-5.5')
    const reader = vi.fn(() => LOW)
    const ctx = await open(dir, { inner: stub, readPower: reader })
    await oneCall(ctx)
    expect(readCallRecords(dir)[0]).not.toHaveProperty('power')
    expect(reader).not.toHaveBeenCalled()
  })

  it('openRun without a reader writes no power', async () => {
    const dir = newDir()
    makeRun(dir)
    const ctx = await open(dir, { inner: stub })
    await oneCall(ctx)
    expect(readCallRecords(dir)[0]).not.toHaveProperty('power')
  })
})
