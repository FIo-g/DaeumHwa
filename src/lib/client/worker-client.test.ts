import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleInput } from '@/db/types'
import { createTextWorkerClient, type TextWorkerApi } from '@/lib/client/worker-client'
import { createTextApi } from '@/workers/text-api'

type Reply = { value: unknown } | 'silent'

/**
 * A stand-in for a Worker. `reply` decides, per Comlink method name, whether the fake answers
 * (like a healthy worker) or stays silent (like a stuck one).
 */
class FakeWorker extends EventTarget {
  readonly terminate = vi.fn()
  readonly methods: string[] = []
  private readonly reply: (method: string) => Reply

  constructor(reply: (method: string) => Reply) {
    super()
    this.reply = reply
  }

  postMessage(message: { id: string; path?: string[] }) {
    const method = (message.path ?? []).join('.')
    this.methods.push(method)
    const answer = this.reply(method)
    if (answer === 'silent') return
    void Promise.resolve().then(() =>
      this.dispatchEvent(
        new MessageEvent('message', {
          data: { id: message.id, type: 'RAW', value: answer.value },
        }),
      ),
    )
  }
}

const silentWorker = () => new FakeWorker(() => 'silent')
const healthyWorker = (value: unknown) =>
  new FakeWorker((method) => ({ value: method === 'ping' ? 'pong' : value }))

const scheduleInput = {
  settings: {
    absenceThreshold: 10,
    publishDays: [1, 2, 3, 4, 5],
    chaptersPerPublishDay: 1,
    bufferTarget: 5,
    targetChars: 5500,
  },
  chapters: [],
  items: [],
} as unknown as ScheduleInput

function clientWith(
  worker: FakeWorker | null,
  extra: { readyTimeoutMs?: number; callTimeoutMs?: number } = {},
) {
  const loadLocal = vi.fn(() => Promise.resolve(createTextApi()))
  const client = createTextWorkerClient({
    startWorker: () => worker as unknown as Worker | null,
    loadLocal,
    ...extra,
  })
  return { client, loadLocal }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('createTextWorkerClient', () => {
  it('uses the worker when it answers, and does not load the main-thread API', async () => {
    const worker = healthyWorker({ chapters: [], method: 'heading' })
    const { client, loadLocal } = clientWith(worker)

    const result = await client.splitChapters('1화\n가')
    expect(result).toEqual({ chapters: [], method: 'heading' })
    expect(worker.methods).toEqual(expect.arrayContaining(['ping', 'splitChapters']))
    expect(loadLocal).not.toHaveBeenCalled()
  })

  it('falls back to the main thread when the worker reports an error', async () => {
    const worker = silentWorker()
    const { client, loadLocal } = clientWith(worker)

    const pending = client.splitChapters('1화\n가\n2화\n나')
    worker.dispatchEvent(new Event('error'))

    const result = await pending
    expect(result.chapters.map((c) => c.title)).toEqual(['1화', '2화'])
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(loadLocal).toHaveBeenCalledTimes(1)
  })

  it('falls back when the worker never answers its first ping', async () => {
    vi.useFakeTimers()
    const worker = silentWorker()
    const { client } = clientWith(worker, { readyTimeoutMs: 1_000 })

    const pending = client.computeSchedule(scheduleInput, '2026-10-16')
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toMatchObject({ bufferCount: 0 })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects a worker call that runs too long, with a Korean message', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker((method) => (method === 'ping' ? { value: 'pong' } : 'silent'))
    const { client, loadLocal } = clientWith(worker, { callTimeoutMs: 20_000 })

    const pending = client.diffTexts('가', '나')
    const assertion = expect(pending).rejects.toThrow('다시 시도해 주세요')
    await vi.advanceTimersByTimeAsync(20_000)

    await assertion
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(loadLocal).not.toHaveBeenCalled()
  })

  it('reruns a call on the main thread when the worker crashes mid-call', async () => {
    const worker = new FakeWorker((method) => (method === 'ping' ? { value: 'pong' } : 'silent'))
    const { client } = clientWith(worker)

    const pending = client.diffTexts('가나', '가다')
    worker.dispatchEvent(new Event('error'))

    const result = await pending
    expect(result).toEqual(await createTextApi().diffTexts('가나', '가다'))
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('keeps the search index on the main thread after the worker dies', async () => {
    const worker = new FakeWorker((method) =>
      method === 'ping' || method === 'setSearchItems'
        ? { value: method === 'ping' ? 'pong' : undefined }
        : 'silent',
    )
    const { client } = clientWith(worker)

    await client.setSearchItems([
      { id: 'a', kind: 'character', name: '이서윤', aliases: ['서윤'], summary: '' },
    ])
    const pending = client.search('서윤')
    worker.dispatchEvent(new Event('error'))

    expect((await pending).map((item) => item.id)).toEqual(['a'])
  })

  it.each([
    ['no Worker can be created', () => null],
    [
      'Worker construction throws',
      () => {
        throw new Error('blocked')
      },
    ],
  ])('uses the main-thread API when %s', async (_label, startWorker) => {
    const loadLocal = vi.fn(() => Promise.resolve(createTextApi()))
    const client: TextWorkerApi = createTextWorkerClient({ startWorker, loadLocal })

    const result = await client.splitChapters('1화\n가\n2화\n나')
    expect(result.chapters.map((c) => c.title)).toEqual(['1화', '2화'])
    expect(loadLocal).toHaveBeenCalledTimes(1)
  })
})

describe('getTextWorker', () => {
  it('works on the main thread when Workers are unavailable, with the parser loaded on demand', async () => {
    vi.stubGlobal('Worker', undefined)
    vi.resetModules()
    const { getTextWorker } = await import('@/lib/client/worker-client')

    const result = await getTextWorker().splitChapters('1화\n본문\n2화\n본문')
    expect(result.chapters.map((c) => c.title)).toEqual(['1화', '2화'])
  })

  it('does not import the text API statically, so the parser stays out of client bundles', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./worker-client.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/^import\s+(?!type)[^;\n]*from\s+'@\/workers\/text-api'/m)
    expect(source).toMatch(/import\('@\/workers\/text-api'\)/)
  })
})
