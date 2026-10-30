import { describe, expect, it } from 'vitest'
import { MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import type { CallRecord } from '../eval-client'
import { newState, type RunConfig } from '../state'
import { buildRunSummary, outputCapSummary, RunSummarySchema } from './finish'

// Output-cap counts in the run summary (track M4). Kept apart from finish.HX5.test.ts (spec 5).

const config: RunConfig = {
  runId: 'run-m4',
  modelId: 'haiku-5.5',
  lang: 'ko',
  chapters: 1,
  questions: 2,
  maxDraftAttempts: 2,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'test',
}

// Only the fields the output-cap summary reads are set; the rest is cast away.
function call(fields: Partial<CallRecord>): CallRecord {
  return {
    task: 'draft-chapter',
    step: null,
    kind: 'object',
    startedAt: '2026-10-19T00:00:00.000Z',
    durationMs: 0,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    productTimeoutMs: 120_000,
    wouldTimeOut: false,
    prompt: '',
    error: null,
    usage: { inputTokens: 1, outputTokens: 1 },
    taskMaxTokens: 16000,
    maxTokensRule: 'floor',
    ...fields,
  } as CallRecord
}

const CUT = { kind: 'model' as const, message: MAX_TOKENS_MESSAGE }

describe('outputCapSummary', () => {
  it('counts cut-off calls and calls over the task cap', () => {
    const summary = outputCapSummary([
      call({ error: CUT, usage: { inputTokens: 1, outputTokens: 16000 } }),
      call({ task: 'proofread', usage: { inputTokens: 1, outputTokens: 18000 } }),
      call({ task: 'proofread', usage: { inputTokens: 1, outputTokens: 16000 } }),
      call({
        task: 'interview-question',
        taskMaxTokens: 2000,
        usage: { inputTokens: 1, outputTokens: 500 },
      }),
      call({
        task: 'chapter-extract',
        error: CUT,
        usage: { inputTokens: 1, outputTokens: 32000 },
      }),
    ])
    expect(summary?.cutOff).toEqual({
      total: 2,
      byTask: { 'draft-chapter': 1, 'chapter-extract': 1 },
    })
    expect(summary?.overTaskCap).toEqual({
      total: 2,
      byTask: { proofread: 1, 'chapter-extract': 1 },
    })
  })

  it('mode is product when any call ran with product limits, floor otherwise', () => {
    expect(outputCapSummary([call({ maxTokensRule: 'floor' })])?.mode).toBe('floor')
    expect(
      outputCapSummary([call({ maxTokensRule: 'floor' }), call({ maxTokensRule: 'product' })])
        ?.mode,
    ).toBe('product')
  })

  it('records from before M4 are skipped', () => {
    const old = call({
      taskMaxTokens: undefined,
      maxTokensRule: undefined,
      usage: { inputTokens: 1, outputTokens: 90000 },
    })
    expect(outputCapSummary([old])).toBeNull()
    const summary = outputCapSummary([old, call({ usage: { inputTokens: 1, outputTokens: 100 } })])
    expect(summary?.overTaskCap.total).toBe(0)
    expect(summary?.cutOff.total).toBe(0)
  })

  it('compares each Ollama attempt to the task cap, not the summed retries', () => {
    // A plain-JSON retry adds its tokens to the call usage. Each response stayed under 2000.
    const attempt = (n: number, evalCount: number) => ({
      task: 'interview-question',
      model: 'qwen',
      attempt: n,
      done: true,
      doneReason: 'stop',
      loadMs: null,
      promptEvalMs: null,
      evalMs: null,
      totalMs: null,
      otherMs: null,
      promptEvalCount: null,
      evalCount,
      thinkingChunks: 0,
      thinkingChars: 0,
    })
    const retried = {
      task: 'interview-question',
      taskMaxTokens: 2000,
      usage: { inputTokens: 1, outputTokens: 2300 },
      ollama: {
        attempts: [attempt(1, 1200), attempt(2, 1100)],
        unaccountedMs: null,
        promptCacheSuspected: false,
      },
    } as Partial<CallRecord>
    expect(outputCapSummary([call(retried)])?.overTaskCap.total).toBe(0)
    expect(outputCapSummary([call({ ...retried, ollama: undefined })])?.overTaskCap.total).toBe(1)
  })

  it('a call with null usage is not counted as over', () => {
    const summary = outputCapSummary([call({ error: CUT, usage: null })])
    expect(summary?.cutOff.total).toBe(1)
    expect(summary?.overTaskCap.total).toBe(0)
  })
})

describe('buildRunSummary outputCap', () => {
  it('adds outputCap only when measured', () => {
    const state = newState(config)
    const without = buildRunSummary([call({ taskMaxTokens: undefined })], state, 'ko')
    expect(without).not.toHaveProperty('outputCap')

    const withBlock = buildRunSummary(
      [call({ error: CUT, usage: { inputTokens: 1, outputTokens: 16000 } })],
      state,
      'ko',
    )
    expect(withBlock.outputCap?.cutOff.total).toBe(1)
    const parsed = RunSummarySchema.parse(JSON.parse(JSON.stringify(withBlock)))
    expect(parsed.outputCap?.mode).toBe('floor')
  })
})
