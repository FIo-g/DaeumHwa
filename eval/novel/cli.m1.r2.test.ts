import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { advanceRun, formatStatus, initRun, runStatus, type StatusJson } from './cli'
import type { PowerInfo } from './power'
import { loadState, newState, type RunConfig, saveState } from './state'

const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }
const HIGH: PowerInfo = { source: 'ac', mode: 'high', modeRaw: 'powermode 2' }

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-m1-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A call file with only what the power warning reads; the rest of a real record is not needed. */
function writeCall(dir: string, name: string, power: PowerInfo): void {
  const calls = join(dir, 'calls')
  mkdirSync(calls, { recursive: true })
  writeFileSync(join(calls, name), `${JSON.stringify({ seq: 1, power })}\n`)
}

/** Every file under a directory, as absolute paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function statusOf(result: unknown): StatusJson {
  return result as StatusJson
}

describe('formatStatus warning', () => {
  const config: RunConfig = {
    runId: 'r',
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 1,
    maxDraftAttempts: 3,
    createdAt: '2026-10-19T00:00:00.000Z',
    commit: 'test',
  }
  const state = newState(config)

  it('adds a warning only when given', () => {
    expect(formatStatus(state, null, 'W')).toEqual({
      status: 'new',
      step: 'setup',
      pendingKind: null,
      message: null,
      warning: 'W',
    })
    expect('warning' in formatStatus(state, null, null)).toBe(false)
    expect('warning' in formatStatus(state)).toBe(false)
  })
})

describe('status power warning', () => {
  it('warns about recorded low-power calls', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    writeCall(dir, '001-a.json', LOW)
    writeCall(dir, '002-b.json', HIGH)

    const result = statusOf(runStatus({ dir, readPower: () => HIGH }))

    expect(result.warning).toContain('1 of 2')
    expect(result.warning).not.toContain('now')
  })

  it('warns when the Mac is in low power now', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })

    const result = statusOf(runStatus({ dir, readPower: () => LOW }))

    expect(result.warning).toContain('now')
  })

  it('is quiet on a clean run', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    writeCall(dir, '001-a.json', HIGH)

    const result = statusOf(runStatus({ dir, readPower: () => HIGH }))

    expect(result).not.toHaveProperty('warning')
  })

  it('ignores the live reading of a finished run', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    saveState(dir, { ...loadState(dir), status: 'done' })
    writeCall(dir, '001-a.json', HIGH)
    const readPower = vi.fn(() => LOW)

    const result = statusOf(runStatus({ dir, readPower }))

    expect(result).not.toHaveProperty('warning')
    expect(readPower).not.toHaveBeenCalled()
  })

  it('counts recorded low calls of a finished run', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    saveState(dir, { ...loadState(dir), status: 'done' })
    writeCall(dir, '001-a.json', LOW)

    const result = statusOf(runStatus({ dir, readPower: () => LOW }))

    expect(result.warning).toContain('1 of 1')
  })

  it('never reads power for fake and cloud runs', () => {
    const folder = tempDir()
    const fake = join(folder, 'run-fake')
    const cloud = join(folder, 'run-cloud')
    initRun({ model: 'fake', lang: 'ko', dir: fake })
    initRun({ model: 'haiku-5.5', lang: 'ko', dir: cloud })
    writeCall(fake, '001-a.json', LOW)
    writeCall(cloud, '001-a.json', LOW)
    const readPower = vi.fn(() => LOW)

    expect(statusOf(runStatus({ dir: fake, readPower }))).not.toHaveProperty('warning')
    expect(statusOf(runStatus({ dir: cloud, readPower }))).not.toHaveProperty('warning')
    expect(readPower).not.toHaveBeenCalled()
  })

  it('keeps the status when a calls file is bad, and the live reading still warns', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    mkdirSync(join(dir, 'calls'), { recursive: true })
    writeFileSync(join(dir, 'calls', '001-x.json'), '{')

    const result = statusOf(runStatus({ dir, readPower: () => LOW }))

    expect(result.status).toBe('new')
    expect(result.warning).toContain('now')
    expect(result.warning).not.toContain('recorded')
  })

  it('returns the status without a warning when config.json is missing', () => {
    const dir = join(tempDir(), 'orphan')
    mkdirSync(dir, { recursive: true })
    const config: RunConfig = {
      runId: 'orphan',
      modelId: 'qwen3.8-27b',
      lang: 'ko',
      chapters: 1,
      questions: 1,
      maxDraftAttempts: 3,
      createdAt: '2026-10-19T00:00:00.000Z',
      commit: 'test',
    }
    saveState(dir, newState(config))
    const readPower = vi.fn(() => HIGH)

    const result = statusOf(runStatus({ dir, readPower }))

    expect(result.status).toBe('new')
    expect(result).not.toHaveProperty('warning')
  })
})

describe('advance power warning', () => {
  it('returns the warning and does not save it', async () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    saveState(dir, { ...loadState(dir), status: 'paused-limit' })

    const result = await advanceRun(dir, {
      spawnWorker: async () => {},
      pollMs: 10,
      maxSeconds: 60,
      readPower: () => LOW,
    })

    expect(result.warning).toContain('now')
    expect(loadState(dir).message).toBeNull()
    for (const file of filesUnder(dir)) {
      expect(readFileSync(file, 'utf8')).not.toContain('Low Power')
    }
  })

  it('keeps the warning on the paused-error path without saving it', async () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })

    const result = await advanceRun(dir, {
      spawnWorker: async () => {},
      pollMs: 10,
      maxSeconds: 60,
      readPower: () => LOW,
    })

    expect(result.status).toBe('paused-error')
    expect(result.warning).toContain('now')
    expect(loadState(dir).message).not.toContain('Low Power')
  })
})

describe('worker output', () => {
  it('never adds the warning to the worker line', () => {
    const source = readFileSync(fileURLToPath(new URL('./cli.ts', import.meta.url)), 'utf8')
    const start = source.indexOf('export async function runWorker')
    const end = source.indexOf('export type SpawnWorker')
    const slice = source.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(slice).toContain('summarize(dir, state)')
    expect(slice).not.toContain('summarize(dir, state, ')
  })
})
