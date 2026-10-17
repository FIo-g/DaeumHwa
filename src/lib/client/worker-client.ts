import * as Comlink from 'comlink'
import type { ExportPayload, ScheduleInput } from '@/db/types'
import type { DiffMode, DiffPart } from '@/lib/diff'
import type { SplitChapter, SplitMethod } from '@/lib/import/split'
import type { Mention, MentionTarget } from '@/lib/korean/mentions'
import type { ScheduleResult } from '@/lib/schedule'
import type { SearchItem } from '@/lib/search'

export interface TextWorkerApi {
  ping(): Promise<'pong'>
  parseFile(
    name: string,
    bytes: ArrayBuffer,
  ): Promise<{ text: string; encoding: string; format: string }>
  splitChapters(
    text: string,
    options?: { fallbackChars?: number },
  ): Promise<{ chapters: SplitChapter[]; method: SplitMethod }>
  diffTexts(a: string, b: string, mode?: DiffMode): Promise<DiffPart[]>
  buildBackupZip(payload: ExportPayload): Promise<Uint8Array>
  findMentions(text: string, targets: MentionTarget[]): Promise<Mention[]>
  computeSchedule(input: ScheduleInput, today: string): Promise<ScheduleResult>
  setSearchItems(items: SearchItem[]): Promise<void>
  search(query: string, limit?: number): Promise<SearchItem[]>
}

/** How long the worker gets to answer the first ping before the main thread takes over. */
const READY_TIMEOUT_MS = 10_000
/** A worker call that runs longer than this rejects, so the UI shows an error instead of spinning. */
const CALL_TIMEOUT_MS = 20_000
const CALL_TIMEOUT_MESSAGE = '작업 시간이 너무 오래 걸려 중단했습니다. 다시 시도해 주세요.'

export interface TextWorkerClientOptions {
  /** Starts the dedicated worker. Returns null when Workers are unavailable. */
  startWorker: () => Worker | null
  /** Loads the same API on the main thread. Retried on the next call if loading fails. */
  loadLocal: () => Promise<TextWorkerApi>
  readyTimeoutMs?: number
  callTimeoutMs?: number
}

const DIED = Symbol('worker-died')

/**
 * Wraps the dedicated text worker so callers never hang. When the worker cannot start, does not
 * answer its first ping, or crashes, the same calls run on the main thread instead. A call that
 * runs past `callTimeoutMs` rejects with a Korean message and the worker is stopped.
 */
export function createTextWorkerClient(options: TextWorkerClientOptions): TextWorkerApi {
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS
  const callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS

  // Search state lives inside an API instance, so it is replayed into the main-thread instance.
  let searchItems: SearchItem[] | null = null
  let localApi: Promise<TextWorkerApi> | null = null
  const local = (): Promise<TextWorkerApi> => {
    localApi ??= options.loadLocal().then(
      async (api) => {
        if (searchItems) await api.setSearchItems(searchItems)
        return api
      },
      (error: unknown) => {
        localApi = null
        throw error
      },
    )
    return localApi
  }

  let worker: Worker | null = null
  try {
    worker = options.startWorker()
  } catch {
    worker = null
  }

  let dead = worker === null
  const shutdown = () => {
    if (dead) return
    dead = true
    worker?.terminate()
  }

  let remote: TextWorkerApi | null = null
  // Never settles when there is no worker, so the race below only sees real failures.
  let died: Promise<typeof DIED> = new Promise(() => {})
  let ready: Promise<boolean> = Promise.resolve(false)

  if (worker) {
    const current = worker
    remote = Comlink.wrap<TextWorkerApi>(current)
    died = new Promise((resolve) => {
      const onFailure = () => resolve(DIED)
      current.addEventListener('error', onFailure)
      current.addEventListener('messageerror', onFailure)
    })
    died.then(shutdown)

    let timer: ReturnType<typeof setTimeout> | undefined
    const noAnswer = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), readyTimeoutMs)
    })
    ready = Promise.race([
      remote.ping().then(
        () => true,
        () => false,
      ),
      died.then(() => false),
      noAnswer,
    ])
      .finally(() => clearTimeout(timer))
      .then((alive) => {
        if (!alive) shutdown()
        return alive
      })
    // A failure that happens after startup must not surface as an unhandled rejection.
    ready.catch(() => {})
  }

  async function run<T>(invoke: (api: TextWorkerApi) => Promise<T>): Promise<T> {
    const proxy = remote
    if (proxy && !dead && (await ready)) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          shutdown()
          reject(new Error(CALL_TIMEOUT_MESSAGE))
        }, callTimeoutMs)
      })
      try {
        const result = await Promise.race([invoke(proxy), died, timedOut])
        if (result !== DIED) return result
      } finally {
        clearTimeout(timer)
      }
    }
    // The worker is unavailable or crashed during the call: run the same call on the main thread.
    shutdown()
    return invoke(await local())
  }

  const api: TextWorkerApi = {
    ping: () => run((text) => text.ping()),
    parseFile: (name, bytes) => run((text) => text.parseFile(name, bytes)),
    splitChapters: (text, splitOptions) => run((api) => api.splitChapters(text, splitOptions)),
    diffTexts: (a, b, mode) => run((text) => text.diffTexts(a, b, mode)),
    buildBackupZip: (payload) => run((text) => text.buildBackupZip(payload)),
    findMentions: (text, targets) => run((api) => api.findMentions(text, targets)),
    computeSchedule: (input, today) => run((text) => text.computeSchedule(input, today)),
    setSearchItems: (items) => {
      searchItems = items
      return run((text) => text.setSearchItems(items))
    },
    search: (query, limit) => run((text) => text.search(query, limit)),
  }
  return api
}

let shared: TextWorkerApi | null = null

/** The shared text client (lazy singleton). Falls back to the main-thread API when needed. */
export function getTextWorker(): TextWorkerApi {
  shared ??= createTextWorkerClient({ startWorker: startDedicatedWorker, loadLocal: loadLocalApi })
  return shared
}

function startDedicatedWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('../../workers/text.worker.ts', import.meta.url), { type: 'module' })
}

// Loaded on demand so the parser libraries stay out of the client bundles that never fall back.
function loadLocalApi(): Promise<TextWorkerApi> {
  return import('@/workers/text-api').then((module) => module.createTextApi())
}
