import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunContext } from '../run'
import { newState, type RunConfig } from '../state'
import { continueFailureOf, recordScenesCut, scenesCutOf } from './chapter'
import { buildRunSummary, readSummaryInputs } from './finish'
import { ExternalFailureError, type ModelFailure } from './util'

// FX4 (F5, F8): a scenes-mode cut is seen by the eval. The SCENES_CUT warning of the first draft
// row is recorded in the attempt's scenes-cut.json, the failure the client holds for the failed
// scene call is taken, and an external one pauses the run like a continue failure does.

const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-scenes-cut-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const cutRow = (scenesWritten: number) => ({
  text: '첫 장면.',
  warnings: [{ code: 'SCENES_CUT', scenesWritten }],
})

describe('scenesCutOf', () => {
  it('reads the SCENES_CUT warning from a draft run row', () => {
    expect(scenesCutOf(cutRow(2))).toEqual({ scenesWritten: 2 })
    expect(scenesCutOf(cutRow(0))).toEqual({ scenesWritten: 0 })
  })

  it('skips other warnings and rows without one', () => {
    expect(scenesCutOf({ text: '첫 장면.' })).toBeNull()
    expect(scenesCutOf({ text: '첫 장면.', warnings: [] })).toBeNull()
    expect(scenesCutOf(null)).toBeNull()
    expect(
      scenesCutOf({
        warnings: [{ kind: 'continue-failed', reason: 'EMPTY', detail: 'x', message: 'x' }],
      }),
    ).toBeNull()
  })

  it('is not read as a continuation failure', () => {
    expect(continueFailureOf(cutRow(1))).toBeNull()
  })
})

describe('recordScenesCut', () => {
  /** The parts of RunContext it reads: a db whose select chain yields one run row, and the client. */
  function ctxWith(output: unknown, dir: string, held: ModelFailure | null) {
    let taken = 0
    const chain = { from: () => chain, where: () => chain, limit: async () => [{ output }] }
    const client = {
      takeLastFailure: () => {
        taken += 1
        return held
      },
    }
    const ctx = { dir, db: { select: () => chain }, client } as unknown as RunContext
    return { ctx, taken: () => taken }
  }

  const file = (dir: string) => join(dir, 'chapters', '01.attempt-1.scenes-cut.json')

  it('takes the held external failure, writes the file and pauses the run', async () => {
    const dir = newDir()
    const held: ModelFailure = { kind: 'external-limit', message: '429 Too Many Requests' }
    const { ctx, taken } = ctxWith(cutRow(1), dir, held)
    await expect(recordScenesCut(ctx, 'run-1', 1, 1, 3)).rejects.toBeInstanceOf(
      ExternalFailureError,
    )
    expect(taken()).toBe(1)
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toEqual({
      kind: 'scenes-cut',
      scenesWritten: 1,
      planned: 3,
      failure: 'external-limit',
      message: '429 Too Many Requests',
    })
  })

  it('pauses on a network failure too', async () => {
    const dir = newDir()
    const held: ModelFailure = { kind: 'external-network', message: 'fetch failed' }
    const { ctx } = ctxWith(cutRow(2), dir, held)
    await expect(recordScenesCut(ctx, 'run-1', 1, 1, 3)).rejects.toBeInstanceOf(
      ExternalFailureError,
    )
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      failure: 'external-network',
    })
  })

  it('records a model failure without pausing', async () => {
    const dir = newDir()
    const held: ModelFailure = { kind: 'model', message: 'format' }
    const { ctx, taken } = ctxWith(cutRow(1), dir, held)
    await expect(recordScenesCut(ctx, 'run-1', 1, 1, 3)).resolves.toBeUndefined()
    expect(taken()).toBe(1)
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      failure: 'model',
      message: 'format',
    })
  })

  it('records a cut with no failure behind it as budget', async () => {
    const dir = newDir()
    const { ctx, taken } = ctxWith(cutRow(2), dir, null)
    await expect(recordScenesCut(ctx, 'run-1', 1, 1, 4)).resolves.toBeUndefined()
    expect(taken()).toBe(1)
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toEqual({
      kind: 'scenes-cut',
      scenesWritten: 2,
      planned: 4,
      failure: 'budget',
      message: null,
    })
  })

  it('writes nothing and takes nothing for a run row without the warning', async () => {
    const dir = newDir()
    const held: ModelFailure = { kind: 'external-limit', message: 'x' }
    const { ctx, taken } = ctxWith({ text: '첫 장면.' }, dir, held)
    await recordScenesCut(ctx, 'run-1', 1, 1, 3)
    expect(taken()).toBe(0)
    expect(existsSync(file(dir))).toBe(false)
  })
})

describe('scenes cuts in the run summary', () => {
  const config: RunConfig = {
    runId: 'run-fx4',
    modelId: 'fake',
    lang: 'ko',
    chapters: 2,
    questions: 1,
    maxDraftAttempts: 2,
    createdAt: '2026-10-21T00:00:00.000Z',
    commit: 'test',
  }

  const writeCut = (dir: string, name: string, failure: string) => {
    const body = { kind: 'scenes-cut', scenesWritten: 1, planned: 3, failure, message: null }
    writeFileSync(join(dir, 'chapters', name), JSON.stringify(body))
  }

  it('counts the cuts by failure and chapter, apart from continuation failures', () => {
    const dir = newDir()
    writeCut(dir, '01.attempt-1.scenes-cut.json', 'external-limit')
    writeCut(dir, '02.attempt-1.scenes-cut.json', 'model')
    writeCut(dir, '02.attempt-2.scenes-cut.json', 'budget')
    const summary = buildRunSummary([], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary.draft?.scenesCut).toEqual({
      total: 3,
      external: 1,
      byFailure: { 'external-limit': 1, model: 1, budget: 1 },
      byChapter: { '1': 1, '2': 2 },
    })
    expect(summary.draft?.continueFailed.total).toBe(0)
  })

  it('has no draft block when nothing was cut', () => {
    const dir = newDir()
    const summary = buildRunSummary([], newState(config), 'ko', readSummaryInputs(dir))
    expect(summary).not.toHaveProperty('draft')
  })
})
