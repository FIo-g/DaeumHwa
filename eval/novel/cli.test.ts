import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireLock, releaseLock } from './worker-lock'
import { advanceRun, formatStatus, initRun, probeContext, runWorker } from './cli'
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

  function fakeOllama(opts: { failSize?: number; psBytes: number }) {
    const calls: { url: string; numCtx?: number }[] = []
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, numCtx: JSON.parse(String(init?.body ?? '{}')).options?.num_ctx })
      if (url.endsWith('/api/ps')) {
        return Response.json({ models: [{ name: 'qwen3.8:27b-mlx', size: opts.psBytes }] })
      }
      const body = JSON.parse(String(init?.body))
      if (body.options.num_ctx === opts.failSize) {
        return new Response('out of memory', { status: 500 })
      }
      const promptLength = String(body.prompt).length
      return Response.json({ response: 'OK', prompt_eval_count: promptLength > 100 ? 30000 : 5 })
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
