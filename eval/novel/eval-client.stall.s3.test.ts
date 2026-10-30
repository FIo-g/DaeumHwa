import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { MODEL_PROFILES } from './models'
import { EvalClient, STALLED_PARTIAL_MESSAGE } from './eval-client'
import { harnessSummary } from './harness-summary'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { CallRecord } from './eval-client'

const CLOUD = MODEL_PROFILES['haiku-5.5']
const LOCAL = MODEL_PROFILES['qwen3.8-27b']

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-stall-'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function objectArgs(): GenerateObjectArgs<unknown> {
  return {
    task: { name: 'proofread', input: { text: 'She go.' } },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** Inner that hangs until its signal aborts, then rejects with the abort reason. */
function hangUntilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (!signal) return
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
      once: true,
    })
  })
}

describe('eval stall guard', () => {
  it('cuts a cloud call at productTimeoutMs + 60s and retries once', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const inner: AiClient = {
      provider: 'hang',
      defaultModel: 'hang-model',
      async generateObject<T>(args: GenerateObjectArgs<T>) {
        attempts += 1
        if (attempts === 1) {
          await hangUntilAborted(args.signal)
          throw new Error('unreachable')
        }
        return {
          object: { ok: true } as T,
          usage: { inputTokens: 1, outputTokens: 1 },
          model: 'hang-model',
        }
      },
      streamText() {
        throw new Error('unused')
      },
    }
    const client = new EvalClient({ inner, profile: CLOUD, lang: 'ko', callsDir })
    const pending = client.generateObject(objectArgs())
    // productTimeoutMs for proofread is 120s, so the stall cut is at 180s.
    await vi.advanceTimersByTimeAsync(180_000 + 1000)
    const result = await pending
    expect(result.object).toEqual({ ok: true })
    expect(attempts).toBe(2)
    expect(client.records).toHaveLength(2)
    expect(client.records[0]).toMatchObject({ stalled: true })
    expect(client.records[1]?.stalled).toBeFalsy()
  })

  it('throws AI 호출이 멈춰 두 번 끊었습니다. after two stalls', async () => {
    vi.useFakeTimers()
    const inner: AiClient = {
      provider: 'hang',
      defaultModel: 'hang-model',
      async generateObject<T>(args: GenerateObjectArgs<T>) {
        await hangUntilAborted(args.signal)
        throw new Error('unreachable')
      },
      streamText() {
        throw new Error('unused')
      },
    }
    const client = new EvalClient({ inner, profile: CLOUD, lang: 'ko', callsDir })
    const pending = client.generateObject(objectArgs())
    const assertion = expect(pending).rejects.toThrow('AI 호출이 멈춰 두 번 끊었습니다.')
    await vi.advanceTimersByTimeAsync(180_000 + 1000)
    await vi.advanceTimersByTimeAsync(180_000 + 1000)
    await assertion
    expect(client.records.filter((r) => r.stalled).length).toBe(2)
  })

  it('never cuts an ollama call', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const inner: AiClient = {
      provider: 'hang',
      defaultModel: 'hang-model',
      async generateObject<T>(): Promise<{
        object: T
        usage: { inputTokens: number; outputTokens: number }
        model: string
      }> {
        attempts += 1
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 200_000)
        })
        return {
          object: { ok: true } as T,
          usage: { inputTokens: 1, outputTokens: 1 },
          model: 'hang-model',
        }
      },
      streamText() {
        throw new Error('unused')
      },
    }
    const client = new EvalClient({ inner, profile: LOCAL, lang: 'ko', callsDir })
    const pending = client.generateObject(objectArgs())
    await vi.advanceTimersByTimeAsync(180_000 + 5000)
    // Still waiting on the single attempt: no retry and no record yet.
    expect(attempts).toBe(1)
    expect(client.records).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(20_000)
    const result = await pending
    expect(result.object).toEqual({ ok: true })
    expect(attempts).toBe(1)
    expect(client.records).toHaveLength(1)
    expect(client.records[0]?.stalled).toBeFalsy()
  })

  it('does not retry a stream that already sent a chunk', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const inner: AiClient = {
      provider: 'hang',
      defaultModel: 'hang-model',
      async generateObject<T>(): Promise<{
        object: T
        usage: { inputTokens: number; outputTokens: number }
        model: string
      }> {
        throw new Error('unused')
      },
      streamText(args: StreamTextArgs) {
        attempts += 1
        const signal = args.signal
        const textStream = (async function* () {
          yield 'hello '
          await hangUntilAborted(signal)
          throw new Error('unreachable')
        })()
        const final = (async () => {
          await hangUntilAborted(signal)
          throw new Error('unreachable')
        })()
        return { textStream, final }
      },
    }
    const client = new EvalClient({ inner, profile: CLOUD, lang: 'ko', callsDir })
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: {} },
      system: 'sys',
      prompt: 'draft',
      effort: 'high',
      maxTokens: 16000,
    })
    const seen: string[] = []
    let streamError: unknown = null
    const reader = (async () => {
      try {
        for await (const chunk of stream.textStream) seen.push(chunk)
      } catch (error) {
        streamError = error
      }
    })()
    const assertion = expect(stream.final).rejects.toThrow(STALLED_PARTIAL_MESSAGE)
    // draft-chapter streams cut at STREAM timeout (280s) + 60s grace.
    await vi.advanceTimersByTimeAsync(280_000 + 60_000 + 1000)
    await assertion
    await reader
    expect(attempts).toBe(1)
    expect(client.records).toHaveLength(1)
    expect(client.records[0]).toMatchObject({ stalled: true })
    expect(seen).toEqual(['hello '])
    expect(streamError).toBeInstanceOf(Error)
    expect((streamError as Error).message).toBe(STALLED_PARTIAL_MESSAGE)
  })

  it('counts stalls in the harness, and old runs give 0', () => {
    const stallCall = (seq: number, step: string, stalled?: true) =>
      ({
        seq,
        task: 'proofread',
        step,
        kind: 'object',
        durationMs: 1000,
        firstTokenMs: null,
        usage: { inputTokens: 100, outputTokens: 10 },
        ...(stalled ? { stalled: true } : {}),
      }) as unknown as CallRecord
    const records = [
      stallCall(1, 'ch1:draft', true),
      stallCall(2, 'ch1:draft'),
      stallCall(3, 'ch2:draft', true),
    ]
    const summary = harnessSummary(records, {
      chapters: 2,
      drafts: {},
      instructions: () => '',
      settings: 'eval' as const,
    })
    expect(summary.chapters[0]).toMatchObject({ stalls: 1 })
    expect(summary.chapters[1]).toMatchObject({ stalls: 1 })
    expect(summary.total).toMatchObject({ stalls: 2 })
    const oldSummary = harnessSummary([stallCall(1, 'ch1:draft'), stallCall(2, 'ch1:draft')], {
      chapters: 1,
      drafts: {},
      instructions: () => '',
      settings: 'eval' as const,
    })
    expect(oldSummary.chapters[0]).toMatchObject({ stalls: 0 })
    expect(oldSummary.total).toMatchObject({ stalls: 0 })
  })
})
