import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireLock, releaseLock } from './worker-lock'
import {
  advanceRun,
  formatStatus,
  initRun,
  main,
  probeContext,
  resummarizeDate,
  resummarizeRun,
  runWorker,
} from './cli'
import { defaultBlindDir, writeBlindCopy } from './blind'
import { loadState, newState, type RunConfig, saveState } from './state'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A call record with only the fields the summary reads; the rest is the real shape. */
function callRecord(fields: {
  seq: number
  task: string
  step: string
  startedAt: string
  durationMs: number
  usage: { inputTokens: number; outputTokens: number } | null
}): string {
  return `${JSON.stringify({
    ...fields,
    kind: 'object',
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    model: 'fake',
    effortRequested: 'high',
    maxTokens: 1000,
    productTimeoutMs: 1000,
    wouldTimeOut: false,
    system: '',
    prompt: '',
    output: null,
    hangulLeft: 0,
    contextOverflow: false,
    error: null,
  })}\n`
}

describe('resummarize', () => {
  it('rebuilds metrics and the run summary from disk and leaves the calls alone', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    mkdirSync(join(dir, 'metrics'), { recursive: true })
    mkdirSync(join(dir, 'calls'), { recursive: true })
    // The chapter has a Han run, which the old metric missed; the stale metrics file says [].
    writeFileSync(join(dir, 'chapters', '01.md'), `${'가'.repeat(100)} 嬷嬷\n`)
    writeFileSync(join(dir, 'metrics', '01.json'), '{"foreignRuns": []}\n')
    const calls = [
      callRecord({
        seq: 1,
        task: 'chapter-extract',
        step: 'ch1:check',
        startedAt: '2026-10-18T00:00:00.000Z',
        durationMs: 1000,
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
      callRecord({
        seq: 2,
        task: 'continuity-check',
        step: 'ch1:continuity',
        startedAt: '2026-10-18T00:00:00.500Z',
        durationMs: 1000,
        usage: null,
      }),
    ]
    writeFileSync(join(dir, 'calls', '001-chapter-extract.json'), calls[0] as string)
    writeFileSync(join(dir, 'calls', '002-continuity-check.json'), calls[1] as string)
    const before = readFileSync(join(dir, 'calls', '001-chapter-extract.json'), 'utf8')
    const state = loadState(dir)
    state.failed = [{ step: 'ch1:draft', message: 'x' }]
    saveState(dir, state)

    const result = resummarizeRun(dir)

    expect(result).toEqual({ dir, chapters: 1, calls: 2 })
    const metrics = JSON.parse(readFileSync(join(dir, 'metrics', '01.json'), 'utf8'))
    expect(metrics.foreignRuns).toEqual(['嬷嬷'])
    const summary = JSON.parse(readFileSync(join(dir, 'run-summary.json'), 'utf8'))
    expect(summary.calls.total).toBe(2)
    expect(summary.calls.byTask['chapter-extract'].tokens).toBe(30)
    expect(summary.speed.perChapterMs).toEqual({ '1': 1500 })
    expect(summary.speed.perChapterModelMs).toEqual({ '1': 2000 })
    expect(summary.hangulLeft).toBeNull()
    expect(summary.failed).toEqual([{ step: 'ch1:draft', message: 'x' }])
    expect(readFileSync(join(dir, 'calls', '001-chapter-extract.json'), 'utf8')).toBe(before)
  })

  it('rebuilds every run dir under a date folder', () => {
    const folder = join(tempDir(), '2026-10-18')
    initRun({ model: 'fake', lang: 'ko', dir: join(folder, 'run-01-ko') })
    initRun({ model: 'fake', lang: 'en', dir: join(folder, 'run-02-en') })
    const results = resummarizeDate(folder)
    expect(results.map((r) => r.dir)).toEqual([
      join(folder, 'run-01-ko'),
      join(folder, 'run-02-en'),
    ])
    expect(
      JSON.parse(readFileSync(join(folder, 'run-02-en', 'run-summary.json'), 'utf8')),
    ).toMatchObject({
      calls: { total: 0 },
    })
  })

  it('skips a run whose worker is alive and rebuilds the others', () => {
    const folder = join(tempDir(), '2026-10-18')
    const live = join(folder, 'run-01-ko')
    const idle = join(folder, 'run-02-en')
    initRun({ model: 'fake', lang: 'ko', dir: live })
    initRun({ model: 'fake', lang: 'en', dir: idle })
    rmSync(join(idle, 'run-summary.json'), { force: true })
    // A rebuilt live run would overwrite this sentinel.
    writeFileSync(join(live, 'run-summary.json'), 'SENTINEL')
    expect(acquireLock(live)).toBe(true)
    try {
      const results = resummarizeDate(folder)

      expect(results).toEqual([
        { dir: live, skipped: 'worker-running' },
        { dir: idle, chapters: 0, calls: 0 },
      ])
      expect(readFileSync(join(live, 'run-summary.json'), 'utf8')).toBe('SENTINEL')
      expect(existsSync(join(idle, 'run-summary.json'))).toBe(true)
    } finally {
      releaseLock(live)
    }
  })

  it('still refuses a single run whose worker is alive', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(acquireLock(dir)).toBe(true)
    try {
      expect(() => resummarizeRun(dir)).toThrow(/a worker is running/)
    } finally {
      releaseLock(dir)
    }
  })
})

describe('init', () => {
  it('returns the same run when called twice and writes the defaults', () => {
    const dir = join(tempDir(), 'run')
    const first = initRun({ model: 'fake', lang: 'ko', dir })
    const second = initRun({ model: 'fake', lang: 'ko', dir })

    expect(first).toEqual({ dir, status: 'new' })
    expect(second).toEqual({ dir, status: 'new' })
    const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    expect(config).toMatchObject({
      modelId: 'fake',
      lang: 'ko',
      chapters: 5,
      questions: 12,
      maxDraftAttempts: 3,
    })
  })

  it('refuses an existing run with a different model', () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(() => initRun({ model: 'fake', lang: 'en', dir })).toThrow()
  })
})

describe('worker lock', () => {
  it('takes over a stale lock left by a dead pid', () => {
    const dir = tempDir()
    const dead = spawnSync(process.execPath, ['-e', '']).pid as number
    writeFileSync(join(dir, 'worker.pid'), `${dead}\n`)

    expect(acquireLock(dir)).toBe(true)
    releaseLock(dir)
  })

  it('refuses a lock already held by a live pid', () => {
    const dir = tempDir()
    expect(acquireLock(dir)).toBe(true)
    expect(acquireLock(dir)).toBe(false)
    releaseLock(dir)
    expect(acquireLock(dir)).toBe(true)
    releaseLock(dir)
  })
})

describe('formatStatus', () => {
  it('returns the documented JSON shape', () => {
    const config: RunConfig = {
      runId: 'r',
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 1,
      maxDraftAttempts: 3,
      createdAt: '2026-10-18T00:00:00.000Z',
      commit: 'test',
    }
    const state = newState(config)

    expect(formatStatus(state)).toEqual({
      status: 'new',
      step: 'setup',
      pendingKind: null,
      message: null,
    })
    expect(formatStatus({ ...state, status: 'pending', cursor: 2 }, 'interview_answer')).toEqual({
      status: 'pending',
      step: 'ch1:draft',
      pendingKind: 'interview_answer',
      message: null,
    })
  })
})

describe('advance', () => {
  it('runs a fake-author run to done through an in-process worker', async () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', chapters: 1, questions: 2, dir })

    const status = await advanceRun(dir, {
      fakeAuthor: true,
      pollMs: 10,
      maxSeconds: 60,
      spawnWorker: ({ dir: target, fakeAuthor }) => runWorker(target, { fakeAuthor }),
    })

    expect(status).toMatchObject({ status: 'done', step: null })
  })

  it('reports a worker that exits without saving state as paused-error with the log tail', async () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', chapters: 1, questions: 2, dir })
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`)
    writeFileSync(join(dir, 'worker.log'), `${lines.join('\n')}\n`)

    const status = await advanceRun(dir, {
      pollMs: 10,
      maxSeconds: 60,
      spawnWorker: async () => {},
    })

    expect(status.status).toBe('paused-error')
    expect(status.message).toContain('line 25')
    expect(status.message).toContain('line 6')
    expect(status.message).not.toContain('line 5')
    expect(loadState(dir)).toMatchObject({ status: 'paused-error' })
  })

  it('turns a run left running by a dead worker into paused-error', async () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', dir })
    saveState(dir, { ...loadState(dir), status: 'running' })
    const dead = spawnSync(process.execPath, ['-e', '']).pid as number
    writeFileSync(join(dir, 'worker.pid'), `${dead}\n`)

    const status = await advanceRun(dir, {
      pollMs: 10,
      maxSeconds: 60,
      spawnWorker: async () => {},
    })

    expect(status.status).toBe('paused-error')
    expect(status.message).toBeTruthy()
  })

  it('reports a spawn failure as paused-error with the error message', async () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', dir })

    const status = await advanceRun(dir, {
      pollMs: 10,
      maxSeconds: 60,
      spawnWorker: async () => {
        throw new Error('spawn tsx ENOENT')
      },
    })

    expect(status).toMatchObject({ status: 'paused-error', message: 'spawn tsx ENOENT' })
  })

  it('reports running when the window ends while a worker holds the lock', async () => {
    const dir = join(tempDir(), 'run')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(acquireLock(dir)).toBe(true)
    try {
      const status = await advanceRun(dir, { pollMs: 10, maxSeconds: 0 })
      expect(status).toMatchObject({ status: 'running' })
    } finally {
      releaseLock(dir)
    }
  })
})

describe('probeContext', () => {
  const GiB = 1024 ** 3

  /** One streamed /api/generate answer: a single NDJSON line that is also the final chunk. */
  function generateStream(promptEvalCount: number): Response {
    const line = {
      model: 'qwen3.8:27b-mlx',
      response: '',
      done: true,
      prompt_eval_count: promptEvalCount,
    }
    return new Response(`${JSON.stringify(line)}\n`, {
      headers: { 'content-type': 'application/x-ndjson' },
    })
  }

  function fakeOllama(opts: { failSize?: number; psBytes: number }) {
    const calls: { url: string; numCtx?: number; body?: Record<string, unknown> }[] = []
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, numCtx: body?.options?.num_ctx, body })
      if (url.endsWith('/api/ps')) {
        return Response.json({ models: [{ name: 'qwen3.8:27b-mlx', size: opts.psBytes }] })
      }
      if (body.options.num_ctx === opts.failSize) {
        return new Response('out of memory', { status: 500 })
      }
      const promptLength = String(body.prompt).length
      return generateStream(promptLength > 100 ? 30000 : 5)
    }) as typeof fetch
    return { fetchFn, calls }
  }

  it('chooses the first size that loads and passes the long prompt', async () => {
    const outDir = tempDir()
    const { fetchFn } = fakeOllama({ failSize: 131072, psBytes: 20 * GiB })

    const result = await probeContext({
      model: 'qwen3.8-27b',
      sizes: [131072, 65536, 32768],
      fetch: fetchFn,
      baseUrl: 'http://probe.test',
      outDir,
    })

    expect(result.numCtx).toBe(65536)
    const written = JSON.parse(readFileSync(result.file, 'utf8'))
    expect(written.chosenNumCtx).toBe(65536)
  })

  it('probes with streamed, thinking-off, one-token generates', async () => {
    const { fetchFn, calls } = fakeOllama({ psBytes: 20 * GiB })

    await probeContext({
      model: 'qwen3.8-27b',
      sizes: [65536],
      fetch: fetchFn,
      baseUrl: 'http://probe.test',
      outDir: tempDir(),
    })

    const generates = calls.filter((c) => c.url.endsWith('/api/generate'))
    expect(generates).toHaveLength(2)
    for (const call of generates) {
      expect(call.body).toMatchObject({
        stream: true,
        think: false,
        options: { num_ctx: 65536, num_predict: 1 },
      })
    }
  })

  it('records the fetch cause code of an attempt that cannot get headers', async () => {
    const outDir = tempDir()
    const base = fakeOllama({ psBytes: 20 * GiB }).fetchFn
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (body?.options?.num_ctx === 131072) {
        throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })
      }
      return base(input, init)
    }) as typeof fetch

    const result = await probeContext({
      model: 'qwen3.8-27b',
      sizes: [131072, 65536],
      fetch: fetchFn,
      baseUrl: 'http://probe.test',
      outDir,
    })

    expect(result.numCtx).toBe(65536)
    const written = JSON.parse(readFileSync(result.file, 'utf8'))
    expect(written.attempts[0].error).toContain('UND_ERR_HEADERS_TIMEOUT')
  })

  it('skips sizes whose loaded model is over 40 GiB', async () => {
    const { fetchFn } = fakeOllama({ psBytes: 45 * GiB })

    const result = await probeContext({
      model: 'qwen3.8-27b',
      sizes: [65536, 32768],
      fetch: fetchFn,
      baseUrl: 'http://probe.test',
      outDir: tempDir(),
    })

    expect(result.numCtx).toBeNull()
  })
})

/** The JSON line a command printed last, parsed. */
function lastJsonLine(log: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const line = log.mock.calls.at(-1)?.[0]
  return JSON.parse(String(line)) as Record<string, unknown>
}

describe('blind commands', () => {
  it('blind prints the blind dir and its file count', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['blind', '--dir', dir])).toBe(0)
      const printed = lastJsonLine(log)
      expect(String(printed.dir).endsWith(join('blind', 'run-01-ko'))).toBe(true)
      expect(printed.files).toBeGreaterThan(0)
    } finally {
      log.mockRestore()
    }
  })

  it('publish-review writes the docs file and the run review from the blind review', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(defaultBlindDir(dir), { recursive: true })
    writeFileSync(join(defaultBlindDir(dir), 'review.md'), '# Review\nbody')
    const docs = join(tempDir(), 'docs', 'a.md')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['publish-review', '--dir', dir, '--to', docs])).toBe(0)
      expect(lastJsonLine(log)).toEqual({ docsPath: docs, runReviewPath: join(dir, 'review.md') })
    } finally {
      log.mockRestore()
    }
    expect(readFileSync(docs, 'utf8')).toMatch(/^모델: fake \| 언어: ko\n\n# Review\nbody$/)
    expect(readFileSync(join(dir, 'review.md'), 'utf8')).toBe(readFileSync(docs, 'utf8'))
  })

  it('publish-review returns an error when the blind review is missing', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['publish-review', '--dir', dir, '--to', join(tempDir(), 'a.md')])).toBe(1)
      expect(String(lastJsonLine(log).error)).toContain('review.md missing')
    } finally {
      log.mockRestore()
    }
    expect(existsSync(join(dir, 'review.md'))).toBe(false)
  })

  it('blind refuses an out dir that is the run itself and leaves the run intact', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['blind', '--dir', dir, '--out', dir])).toBe(1)
      expect(String(lastJsonLine(log).error)).toContain('unsafe blind output dir')
    } finally {
      log.mockRestore()
    }
    expect(existsSync(join(dir, 'config.json'))).toBe(true)
  })

  it('resummarize skips the blind folder under a date folder', () => {
    const folder = join(tempDir(), '2026-10-19')
    initRun({ model: 'fake', lang: 'ko', dir: join(folder, 'run-01-ko') })
    initRun({ model: 'fake', lang: 'en', dir: join(folder, 'run-02-en') })
    writeBlindCopy(join(folder, 'run-01-ko'), { repoRoot: process.cwd() })
    writeFileSync(join(folder, 'blind', 'run-01-ko', 'review.md'), 'review')

    expect(existsSync(join(folder, 'blind', 'run-01-ko', 'review.md'))).toBe(true)
    expect(resummarizeDate(folder)).toHaveLength(2)
  })
})
