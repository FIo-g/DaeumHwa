import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FailureKind } from '../eval-client'
import type { RunContext } from '../run'
import { recordContinueFailure } from './chapter'
import { ExternalFailureError } from './util'

// Stage 1b fix F7: a refused rewrite is story text, so it is never read as an HTTP error.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chapter-expand-reject-'))
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

const rejected = (detail: string) => ({
  text: '첫 문단.',
  warnings: [
    { kind: 'continue-failed', reason: 'EXPAND_REJECTED', detail, message: '이어쓰기 실패' },
  ],
})

const commentary = (detail: string) => ({
  text: '첫 문단.',
  warnings: [{ kind: 'continue-failed', reason: 'COMMENTARY', detail, message: '이어쓰기 실패' }],
})

describe('recordContinueFailure with story text in the warning', () => {
  it('a refused rewrite with provider-like words is a model failure and does not pause', async () => {
    const dir = newDir()
    const ctx = ctxWith(
      rejected('She pushed open the door of the forbidden wing; the quota of lamps had run out.'),
      dir,
      null,
    )
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).resolves.toBeUndefined()
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      reason: 'EXPAND_REJECTED',
      failure: 'model',
    })
  })

  it('a commentary warning with the word Unauthorized is a model failure and does not pause', async () => {
    const dir = newDir()
    const ctx = ctxWith(commentary('Unauthorized presence on the upper floors.'), dir, null)
    await expect(recordContinueFailure(ctx, 'run-1', 1, 1)).resolves.toBeUndefined()
    expect(JSON.parse(readFileSync(file(dir), 'utf8'))).toMatchObject({
      reason: 'COMMENTARY',
      failure: 'model',
    })
  })

  it('a held external network failure still pauses, with its own message and not the rewrite text', async () => {
    const dir = newDir()
    const ctx = ctxWith(rejected('the forbidden wing'), dir, {
      kind: 'external-network',
      message: 'fetch failed',
    })
    const error = await recordContinueFailure(ctx, 'run-1', 1, 1).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ExternalFailureError)
    expect((error as ExternalFailureError).message).toBe('fetch failed')
    expect(existsSync(file(dir))).toBe(true)
  })
})
