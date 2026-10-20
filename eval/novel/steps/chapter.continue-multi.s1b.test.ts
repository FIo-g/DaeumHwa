import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FailureKind } from '../eval-client'
import type { RunContext } from '../run'
import { recordContinueFailure } from './chapter'
import { ExternalFailureError } from './util'

// Stage 1b fix F8: every continue-failed warning of a draft is recorded, each with its own kind.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chapter-continue-multi-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  return dir
}

/** The parts of RunContext recordContinueFailure reads: one run row, and a client holding `held`. */
function ctxWith(
  output: unknown,
  dir: string,
  held: { kind: FailureKind; message: string } | null,
) {
  const chain = { from: () => chain, where: () => chain, limit: async () => [{ output }] }
  let pending = held
  const client = {
    takeLastFailure: () => {
      const taken = pending
      pending = null
      return taken
    },
  }
  return { db: { select: () => chain }, client, dir } as unknown as RunContext
}

const file = (dir: string) => join(dir, 'chapters', '01.attempt-1.continue.json')

const warnings = (...items: { reason: string; detail: string }[]) => ({
  text: '첫 문단.',
  warnings: items.map((item) => ({ kind: 'continue-failed', ...item, message: '이어쓰기 실패' })),
})

describe('recordContinueFailure with several continue-failed warnings', () => {
  it('writes one entry per warning in order and does not pause on a model failure', async () => {
    const dir = newDir()
    const ctx = ctxWith(
      warnings(
        { reason: 'EXPAND_REJECTED', detail: 'ECHO: first rewrite' },
        { reason: 'EXPAND_REJECTED', detail: 'ECHO: second rewrite' },
        { reason: 'EXPAND_ERROR', detail: 'AI_ERROR' },
      ),
      dir,
      { kind: 'model', message: 'bad output' },
    )
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).resolves.toBeUndefined()
    const written = JSON.parse(readFileSync(file(dir), 'utf8'))
    expect(written.failures).toHaveLength(3)
    expect(written.failures.map((item: { reason: string }) => item.reason)).toEqual([
      'EXPAND_REJECTED',
      'EXPAND_REJECTED',
      'EXPAND_ERROR',
    ])
    expect(written.failure).toBe('model')
  })

  it('files a rejection under model and pauses with the held failure message', async () => {
    const dir = newDir()
    const ctx = ctxWith(
      warnings(
        { reason: 'EXPAND_REJECTED', detail: 'ECHO: the forbidden wing' },
        { reason: 'EXPAND_ERROR', detail: 'AI_UNAVAILABLE' },
      ),
      dir,
      { kind: 'external-network', message: 'fetch failed' },
    )
    const error = await recordContinueFailure(ctx, 'run-1', 1, 1).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExternalFailureError)
    expect((error as ExternalFailureError).message).toBe('fetch failed')
    const written = JSON.parse(readFileSync(file(dir), 'utf8'))
    expect(written.failures[0]).toMatchObject({ reason: 'EXPAND_REJECTED', failure: 'model' })
    expect(written.failures[1]).toMatchObject({
      reason: 'EXPAND_ERROR',
      failure: 'external-network',
    })
  })

  it('a lone rejection whose rewrite holds provider-like words does not pause', async () => {
    const dir = newDir()
    const ctx = ctxWith(
      warnings({ reason: 'EXPAND_REJECTED', detail: 'the forbidden wing' }),
      dir,
      null,
    )
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).resolves.toBeUndefined()
    expect(JSON.parse(readFileSync(file(dir), 'utf8')).failures).toHaveLength(1)
  })

  it('an expansion that hit the usage limit is an external limit and pauses', async () => {
    const dir = newDir()
    const ctx = ctxWith(warnings({ reason: 'EXPAND_ERROR', detail: 'AI_LIMIT' }), dir, null)
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).rejects.toBeInstanceOf(
      ExternalFailureError,
    )
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      failure: 'external-limit',
      failures: [{ reason: 'EXPAND_ERROR', failure: 'external-limit' }],
    })
  })
})
