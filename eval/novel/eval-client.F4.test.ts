import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiTaskName } from '@/db/types'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { MODEL_PROFILES } from './models'
import { type CallRecord, EvalClient } from './eval-client'

// Lane and timing tests for the eval client (track F4). Kept apart from eval-client.test.ts (spec 5).

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-f4-'))
})

/** Lets pending promise callbacks run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function objectArgs(
  task: AiTaskName,
  overrides: Partial<GenerateObjectArgs<unknown>> = {},
): GenerateObjectArgs<unknown> {
  return {
    task: { name: task, input: {} },
    system: proofreadTask.system,
    prompt: '<manuscript>\nShe go.\n</manuscript>',
    schema: proofreadTask.schema,
    effort: 'medium',
    maxTokens: 16000,
    ...overrides,
  }
}

function streamArgs(task: AiTaskName): StreamTextArgs {
  return {
    task: { name: task, input: {} },
    system: 'SYSTEM',
    prompt: 'PROMPT',
    effort: 'medium',
    maxTokens: 16000,
  }
}

/** Resolves to the error a promise rejects with. Fails the test if it resolves. */
async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the call to reject')
}

/**
 * Inner client that logs start and end of each object call. A call's end waits for its release
 * function, which the test calls by task name.
 */
function gateClient(log: string[]) {
  const releases = new Map<string, () => void>()
  const client: AiClient = {
    provider: 'gate',
    defaultModel: 'gate-model',
    async generateObject<T>(args: GenerateObjectArgs<T>) {
      const name = args.task.name
      log.push(`start:${name}`)
      await new Promise<void>((resolve) => releases.set(name, resolve))
      log.push(`end:${name}`)
      return { object: { suggestions: [] } as T, usage: USAGE, model: 'gate-model' }
    },
    streamText() {
      throw new Error('streamText is not used by this client')
    },
  }
  return { client, release: (name: string) => releases.get(name)?.() }
}

describe('EvalClient local lane', () => {
  it('runs two local calls one at a time', async () => {
    const log: string[] = []
    const { client: inner, release } = gateClient(log)
    const client = new EvalClient({ inner, profile: QWEN, lang: 'ko', callsDir })

    const first = client.generateObject(objectArgs('continuity-check'))
    const second = client.generateObject(objectArgs('chapter-extract'))
    await tick()
    expect(log).toEqual(['start:continuity-check'])

    release('continuity-check')
    await first
    await tick()
    expect(log).toEqual(['start:continuity-check', 'end:continuity-check', 'start:chapter-extract'])

    release('chapter-extract')
    await second
    expect(log).toEqual([
      'start:continuity-check',
      'end:continuity-check',
      'start:chapter-extract',
      'end:chapter-extract',
    ])
  })

  it('does not serialize cloud calls', async () => {
    const log: string[] = []
    const { client: inner } = gateClient(log)
    const client = new EvalClient({ inner, profile: CLOUD, lang: 'ko', callsDir })

    void client.generateObject(objectArgs('continuity-check'))
    void client.generateObject(objectArgs('chapter-extract'))
    await tick()
    expect(log).toEqual(['start:continuity-check', 'start:chapter-extract'])
  })

  it('releases the lane when a call fails', async () => {
    let calls = 0
    const inner: AiClient = {
      provider: 'failing',
      defaultModel: 'failing-model',
      async generateObject<T>(): Promise<{ object: T; usage: AiUsage; model: string }> {
        calls += 1
        if (calls === 1) throw new Error('first call failed')
        return { object: { suggestions: [] } as T, usage: USAGE, model: 'failing-model' }
      },
      streamText() {
        throw new Error('streamText is not used by this client')
      },
    }
    const client = new EvalClient({ inner, profile: QWEN, lang: 'ko', callsDir })

    const [first, second] = await Promise.allSettled([
      client.generateObject(objectArgs('continuity-check')),
      client.generateObject(objectArgs('chapter-extract')),
    ])
    expect(calls).toBe(2)
    expect(first.status).toBe('rejected')
    expect(second.status).toBe('fulfilled')
  })

  it('records queueMs and leaves it out of durationMs', async () => {
    const clock = { t: 0 }
    const durations: Record<string, number> = { 'continuity-check': 100, 'chapter-extract': 40 }
    const inner: AiClient = {
      provider: 'clock',
      defaultModel: 'clock-model',
      async generateObject<T>(args: GenerateObjectArgs<unknown>) {
        await tick()
        clock.t += durations[args.task.name] ?? 0
        return { object: { suggestions: [] } as T, usage: USAGE, model: 'clock-model' }
      },
      streamText() {
        throw new Error('streamText is not used by this client')
      },
    }
    const client = new EvalClient({
      inner,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })

    await Promise.all([
      client.generateObject(objectArgs('continuity-check')),
      client.generateObject(objectArgs('chapter-extract')),
    ])
    const [first, second] = client.records
    expect(first.queueMs).toBe(0)
    expect(first.durationMs).toBe(100)
    expect(second.queueMs).toBe(100)
    expect(second.durationMs).toBe(40)
    expect(second.waitInclusiveMs).toBe(140)
  })

  it('an aborted queued call stops waiting', async () => {
    const clock = { t: 0 }
    const log: string[] = []
    const { client: inner, release } = gateClient(log)
    const client = new EvalClient({
      inner,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })

    const first = client.generateObject(objectArgs('continuity-check'))
    const controller = new AbortController()
    const second = client.generateObject(
      objectArgs('chapter-extract', { signal: controller.signal }),
    )
    await tick()
    controller.abort()
    const secondError = await thrownBy(second)
    expect(log).toEqual(['start:continuity-check'])
    expect(secondError).toMatchObject({ name: 'AbortError' })

    const failed = client.records.find((r) => r.task === 'chapter-extract')
    expect(failed?.error).not.toBeNull()
    expect(failed?.error?.message).toBe((secondError as Error).message)
    expect(failed?.durationMs).toBe(0)

    const third = client.generateObject(objectArgs('proofread'))
    release('continuity-check')
    await first
    await tick()
    expect(log).toContain('start:proofread')
    release('proofread')
    await third
    expect(log.indexOf('start:proofread')).toBeGreaterThan(log.indexOf('end:continuity-check'))
  })
})

describe('EvalClient thinkRequested', () => {
  function echoClient(): AiClient {
    return {
      provider: 'echo',
      defaultModel: 'echo-model',
      async generateObject<T>() {
        return { object: { suggestions: [] } as T, usage: USAGE, model: 'echo-model' }
      },
      streamText() {
        const textStream = (async function* () {
          yield 'text'
        })()
        return { textStream, final: Promise.resolve({ text: 'text', usage: USAGE, model: 'm' }) }
      },
    }
  }

  async function drain(stream: ReturnType<AiClient['streamText']>) {
    const pieces: string[] = []
    for await (const piece of stream.textStream) pieces.push(piece)
    expect(pieces.join('')).toBe('text')
    await stream.final
  }

  it('records the helper think value on helper and prose calls', async () => {
    const client = new EvalClient({
      inner: echoClient(),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      helperThink: 'off',
    })
    await client.generateObject(objectArgs('proofread'))
    await drain(client.streamText(streamArgs('draft-chapter')))
    await drain(client.streamText(streamArgs('draft-continue')))

    const thinks = Object.fromEntries(client.records.map((r) => [r.task, r.thinkRequested]))
    expect(thinks).toEqual({ proofread: false, 'draft-chapter': true, 'draft-continue': true })
  })

  it('records the profile think when no helper setting is given', async () => {
    const client = new EvalClient({ inner: echoClient(), profile: QWEN, lang: 'ko', callsDir })
    await client.generateObject(objectArgs('proofread'))
    await drain(client.streamText(streamArgs('draft-chapter')))

    const thinks = client.records.map((r: CallRecord) => r.thinkRequested)
    expect(thinks).toEqual([true, true])
  })
})

describe('EvalClient record files', () => {
  it('writes queueMs and waitInclusiveMs into the call file', async () => {
    const clock = { t: 0 }
    const inner: AiClient = {
      provider: 'clock',
      defaultModel: 'clock-model',
      async generateObject<T>() {
        await tick()
        clock.t += 10
        return { object: { suggestions: [] } as T, usage: USAGE, model: 'clock-model' }
      },
      streamText() {
        throw new Error('streamText is not used by this client')
      },
    }
    const client = new EvalClient({
      inner,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      now: () => clock.t,
    })
    await client.generateObject(objectArgs('proofread'))
    const file = readFileSync(join(callsDir, '001-proofread.json'), 'utf8')
    const record = JSON.parse(file) as CallRecord
    expect(record).toMatchObject({ queueMs: 0, durationMs: 10, waitInclusiveMs: 10 })
  })
})
