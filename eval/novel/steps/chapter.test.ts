import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig, type RunState } from '../state'
import type { RunContext } from '../run'
import { repairBestEffort } from './chapter'
import { ExternalFailureError } from './util'

type CallError = NonNullable<CallRecord['error']>

const config: RunConfig = {
  runId: 'run-1',
  modelId: 'fake',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 2,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'abc1234',
}

let dir: string
let state: RunState

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'novel-chapter-e2-'))
  state = newState(config)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** The parts of RunContext that repairBestEffort reads: the dir for persist and the client. */
function ctxWith(failure: CallError | null): RunContext {
  let pending = failure
  const client = {
    nextSeq: 0,
    takeLastFailure: () => {
      const current = pending
      pending = null
      return current
    },
  }
  return { dir, client } as unknown as RunContext
}

const label = 'ch1:draft:repair'

describe('repairBestEffort', () => {
  it('returns the repaired text when the repair succeeds', async () => {
    const text = await repairBestEffort(
      ctxWith(null),
      state,
      label,
      async () => ({ text: 'new' }),
      'old',
    )
    expect(text).toBe('new')
    expect(state.failed).toEqual([])
  })

  it('keeps the unrepaired text and records a model failure', async () => {
    const text = await repairBestEffort(
      ctxWith({ kind: 'model', message: 'x' }),
      state,
      label,
      async () => {
        throw new Error('boom')
      },
      'old',
    )
    expect(text).toBe('old')
    expect(state.failed).toEqual([{ step: label, message: 'x' }])
  })

  it('pauses the run on an external limit failure', async () => {
    await expect(
      repairBestEffort(
        ctxWith({ kind: 'external-limit', message: 'x' }),
        state,
        label,
        async () => {
          throw new Error('boom')
        },
        'old',
      ),
    ).rejects.toBeInstanceOf(ExternalFailureError)
  })

  it('keeps the unrepaired text when no failure was recorded', async () => {
    const text = await repairBestEffort(
      ctxWith(null),
      state,
      label,
      async () => {
        throw new Error('service bug')
      },
      'old',
    )
    expect(text).toBe('old')
    expect(state.failed).toEqual([{ step: label, message: 'service bug' }])
  })
})
