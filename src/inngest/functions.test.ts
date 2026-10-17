import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ advance: vi.fn() }))

// The function is captured from createFunction so its handler can run with a fake step.
vi.mock('@/inngest/client', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
  },
}))
vi.mock('@/db/client', () => ({ getDb: () => ({}) }))
vi.mock('@/server/imports', () => ({ advanceImportJob: mocks.advance }))

import { MAX_STEPS_PER_RUN, importRun } from '@/inngest/functions'

type Handler = (ctx: unknown) => Promise<unknown>
const handler = (importRun as unknown as { handler: Handler }).handler

function fakeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn(async () => ({ ids: ['next'] })),
  }
}

function result(status: string, done = false) {
  return { status, processed: 0, total: 0, done, message: null }
}

describe('importRun', () => {
  beforeEach(() => {
    mocks.advance.mockReset()
  })

  it('stops at the done result without sending a new event', async () => {
    mocks.advance
      .mockResolvedValueOnce(result('running'))
      .mockResolvedValueOnce(result('done', true))
    const step = fakeStep()

    const out = await handler({ event: { data: { jobId: 'job-1' } }, step })

    expect(mocks.advance).toHaveBeenCalledTimes(2)
    expect(out).toEqual(result('done', true))
    expect(step.sendEvent).not.toHaveBeenCalled()
  })

  it('stops at a paused job without sending a new event', async () => {
    mocks.advance.mockResolvedValueOnce(result('paused'))
    const step = fakeStep()

    await handler({ event: { data: { jobId: 'job-1' } }, step })

    expect(mocks.advance).toHaveBeenCalledTimes(1)
    expect(step.sendEvent).not.toHaveBeenCalled()
  })

  it('hands a long import over to a new run instead of exceeding the step cap', async () => {
    mocks.advance.mockResolvedValue(result('running'))
    const step = fakeStep()

    const out = await handler({ event: { data: { jobId: 'job-1' } }, step })

    expect(MAX_STEPS_PER_RUN).toBeLessThanOrEqual(1000)
    expect(step.run).toHaveBeenCalledTimes(MAX_STEPS_PER_RUN)
    expect(step.sendEvent).toHaveBeenCalledTimes(1)
    expect(step.sendEvent).toHaveBeenCalledWith('continue-import', {
      name: 'import/run',
      data: { jobId: 'job-1' },
    })
    expect(out).toEqual({ status: 'running', done: false })
  })
})
