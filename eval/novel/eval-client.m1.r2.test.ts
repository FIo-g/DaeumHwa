import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proofreadTask } from '@/ai/tasks/proofread'
import type { AiTaskName } from '@/db/types'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { MODEL_PROFILES } from './models'
import { type PowerInfo, UNKNOWN_POWER } from './power'
import { EvalClient } from './eval-client'

// Power sampling tests for the eval client (track M1). Copies the helpers of eval-client.F4.test.ts.

const QWEN = MODEL_PROFILES['qwen3.8-27b']
const CLOUD = MODEL_PROFILES['haiku-5.5']
const USAGE: AiUsage = { inputTokens: 10, outputTokens: 5 }
const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }
const HIGH: PowerInfo = { source: 'ac', mode: 'high', modeRaw: 'powermode 2' }

let callsDir: string
beforeEach(() => {
  callsDir = mkdtempSync(join(tmpdir(), 'eval-client-m1-'))
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

/** Inner client that answers objects and streams at once, with usage. */
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
  for await (const piece of stream.textStream) void piece
  await stream.final
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

function readCall(seq: number, task: string): Record<string, unknown> {
  const name = `${String(seq).padStart(3, '0')}-${task}.json`
  return JSON.parse(readFileSync(join(callsDir, name), 'utf8')) as Record<string, unknown>
}

describe('EvalClient power sampling', () => {
  it('records the power state at the start of a local call', async () => {
    const client = new EvalClient({
      inner: echoClient(),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      readPower: () => LOW,
    })
    await client.generateObject(objectArgs('proofread'))
    await drain(client.streamText(streamArgs('draft-chapter')))

    expect(client.records.map((r) => r.power)).toEqual([LOW, LOW])
    expect(readCall(1, 'proofread').power).toEqual(LOW)
    expect(readCall(2, 'draft-chapter').power).toEqual(LOW)
  })

  it('has no power field without a reader', async () => {
    const client = new EvalClient({ inner: echoClient(), profile: QWEN, lang: 'ko', callsDir })
    const record = await client
      .generateObject(objectArgs('proofread'))
      .then(() => client.records[0])
    expect(record).not.toHaveProperty('power')
    expect(readFileSync(join(callsDir, '001-proofread.json'), 'utf8')).not.toContain('"power"')
  })

  it('does not read power on a cloud profile', async () => {
    const reader = vi.fn(() => LOW)
    const client = new EvalClient({
      inner: echoClient(),
      profile: CLOUD,
      lang: 'ko',
      callsDir,
      readPower: reader,
    })
    await client.generateObject(objectArgs('proofread'))
    expect(reader).not.toHaveBeenCalled()
    expect(client.records[0]).not.toHaveProperty('power')
  })

  it('reads power when the call gets its turn', async () => {
    const log: string[] = []
    const { client: inner, release } = gateClient(log)
    const reader = vi.fn<() => PowerInfo>().mockReturnValueOnce(HIGH).mockReturnValue(LOW)
    const client = new EvalClient({
      inner,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      readPower: reader,
    })

    const first = client.generateObject(objectArgs('continuity-check'))
    const second = client.generateObject(objectArgs('chapter-extract'))
    await tick()
    expect(reader).toHaveBeenCalledTimes(1)

    release('continuity-check')
    await first
    await tick()
    release('chapter-extract')
    await second

    expect(client.records.map((r) => r.power)).toEqual([HIGH, LOW])
    expect(reader).toHaveBeenCalledTimes(2)
  })

  it('a failing reader does not fail the call', async () => {
    const client = new EvalClient({
      inner: echoClient(),
      profile: QWEN,
      lang: 'ko',
      callsDir,
      readPower: () => {
        throw new Error('pmset gone')
      },
    })
    await expect(client.generateObject(objectArgs('proofread'))).resolves.toBeDefined()
    expect(client.records[0]?.power).toEqual(UNKNOWN_POWER)
    expect(client.takeLastFailure()).toBeNull()
  })

  it('the power read is not call time', async () => {
    const clock = { t: 0 }
    const inner: AiClient = {
      provider: 'clock',
      defaultModel: 'clock-model',
      async generateObject<T>() {
        await tick()
        clock.t += 100
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
      readPower: () => {
        clock.t += 25
        return LOW
      },
    })
    await client.generateObject(objectArgs('proofread'))
    const [record] = client.records
    expect(record?.durationMs).toBe(100)
    expect(record?.queueMs).toBe(25)
    expect(record?.startedAt).toBe(new Date(25).toISOString())
  })

  it('a call aborted while queued still records a sample', async () => {
    const log: string[] = []
    const { client: inner, release } = gateClient(log)
    const client = new EvalClient({
      inner,
      profile: QWEN,
      lang: 'ko',
      callsDir,
      readPower: () => LOW,
    })

    const first = client.generateObject(objectArgs('continuity-check'))
    const controller = new AbortController()
    const second = client.generateObject(
      objectArgs('chapter-extract', { signal: controller.signal }),
    )
    await tick()
    controller.abort()
    await thrownBy(second)

    const failed = client.records.find((r) => r.task === 'chapter-extract')
    expect(failed?.error).not.toBeNull()
    expect(failed?.power).toEqual(LOW)

    release('continuity-check')
    await first
  })
})
