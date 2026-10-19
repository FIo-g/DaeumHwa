import { describe, expect, it } from 'vitest'
import type { OllamaAttempt } from '@/ai/ollama'
import type { CallRecord } from '../eval-client'
import { ollamaSummary, RunSummarySchema, slowSummary, speedSummary } from './finish'

// Slow-call and Ollama time blocks of the run summary (track M2). Kept apart from finish.test.ts.

function at(ms: number): string {
  return new Date(Date.UTC(2026, 9, 19, 0, 0, 0) + ms).toISOString()
}

// Only the fields the summaries read are set; the rest is cast away.
function call(fields: Partial<CallRecord>): CallRecord {
  return {
    task: 'continuity-check',
    step: 'ch1:check',
    startedAt: at(0),
    durationMs: 0,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    ...fields,
  } as CallRecord
}

/** An Ollama-source ok call with the given output rate and output token count. */
function ollamaCall(fields: {
  seq: number
  rate: number
  outputTokens?: number
  error?: CallRecord['error']
  source?: 'ollama' | 'wall'
  task?: CallRecord['task']
  durationMs?: number
  ollama?: CallRecord['ollama']
}): CallRecord {
  return call({
    seq: fields.seq,
    task: fields.task ?? 'continuity-check',
    durationMs: fields.durationMs ?? 1000,
    speed: {
      outputTokensPerSec: fields.rate,
      promptTokensPerSec: null,
      source: fields.source ?? 'ollama',
    },
    usage: {
      inputTokens: 10,
      outputTokens: fields.outputTokens ?? 100,
    } as CallRecord['usage'],
    error: fields.error ?? null,
    ...(fields.ollama ? { ollama: fields.ollama } : {}),
  })
}

/** Five ok calls at 100 tokens per second, the usual baseline for the slow tests. */
function baseline(): CallRecord[] {
  return [1, 2, 3, 4, 5].map((seq) => ollamaCall({ seq, rate: 100 }))
}

function attempt(fields: Partial<OllamaAttempt>): OllamaAttempt {
  return {
    task: 'continuity-check',
    model: 'local-model',
    attempt: 1,
    done: true,
    doneReason: 'stop',
    loadMs: 0,
    promptEvalMs: 0,
    evalMs: 0,
    totalMs: 0,
    otherMs: 0,
    promptEvalCount: 0,
    evalCount: 0,
    thinkingChunks: 0,
    thinkingChars: 0,
    ...fields,
  }
}

describe('slowSummary', () => {
  it('flags a call under 70% of the usual speed', () => {
    const calls = [...baseline().slice(0, 4), ollamaCall({ seq: 5, rate: 69 })]
    const block = slowSummary(calls)
    expect(block?.usualOutputTokensPerSec).toBe(100)
    expect(block?.thresholdRatio).toBe(0.7)
    expect(block?.calls).toHaveLength(1)
    expect(block?.calls[0]?.seq).toBe(5)
    expect(block?.calls[0]?.ratio).toBeCloseTo(0.69)
  })

  it('does not flag a call at exactly 70%', () => {
    const calls = [...baseline().slice(0, 4), ollamaCall({ seq: 5, rate: 70 })]
    const block = slowSummary(calls)
    expect(block?.usualOutputTokensPerSec).toBe(100)
    expect(block?.calls).toEqual([])
  })

  it('needs five qualifying calls', () => {
    const four = baseline().slice(0, 4)
    expect(slowSummary(four)).toBeNull()
    expect('slow' in speedSummary(four)).toBe(false)
  })

  it('ignores failed calls, wall-source calls and calls under 50 output tokens', () => {
    const calls = [
      ...baseline(),
      ollamaCall({ seq: 6, rate: 10, error: { kind: 'model', message: 'failed' } }),
      ollamaCall({ seq: 7, rate: 10, source: 'wall' }),
      ollamaCall({ seq: 8, rate: 10, outputTokens: 49 }),
    ]
    const block = slowSummary(calls)
    expect(block?.usualOutputTokensPerSec).toBe(100)
    expect(block?.calls).toEqual([])
  })

  it('works on records without an ollama block', () => {
    const calls = baseline()
    expect(calls.every((c) => c.ollama === undefined)).toBe(true)
    expect(slowSummary(calls)).not.toBeNull()
  })
})

describe('ollamaSummary', () => {
  const rowA = ollamaCall({
    seq: 1,
    rate: 50,
    task: 'continuity-check',
    durationMs: 1000,
    ollama: {
      attempts: [
        attempt({
          task: 'continuity-check',
          loadMs: 100,
          promptEvalMs: 200,
          evalMs: 300,
          totalMs: 700,
          otherMs: 100,
          thinkingChunks: 3,
          thinkingChars: 40,
        }),
      ],
      unaccountedMs: 300,
      promptCacheSuspected: false,
    },
  })

  const rowB = ollamaCall({
    seq: 2,
    rate: 50,
    task: 'chapter-extract',
    durationMs: 500,
    ollama: {
      attempts: [
        attempt({
          task: 'chapter-extract',
          attempt: 1,
          doneReason: 'length',
          totalMs: 150,
          promptEvalMs: 50,
          evalMs: 100,
          otherMs: 0,
        }),
        attempt({
          task: 'chapter-extract',
          attempt: 2,
          totalMs: 150,
          promptEvalMs: 50,
          evalMs: 100,
          otherMs: 0,
        }),
      ],
      unaccountedMs: 200,
      promptCacheSuspected: false,
    },
  })

  it('adds up the time', () => {
    const block = ollamaSummary([rowA, rowB])
    expect(block?.calls).toBe(2)
    expect(block?.attempts).toBe(3)
    expect(block?.retried).toBe(1)
    expect(block?.lengthCut).toBe(1)
    expect(block?.thinking).toEqual({ chunks: 3, chars: 40 })
    expect(block?.timed.calls).toBe(2)
    expect(block?.timed.wallMs).toBe(1500)
    expect(block?.timed.unaccountedMs).toBe(500)
    expect(block?.timed.unaccountedShare).toBeCloseTo(1 / 3)
    expect(block?.timed.unaccountedByTask).toEqual({
      'continuity-check': 300,
      'chapter-extract': 200,
    })
    const timed = block?.timed
    expect(timed).toBeDefined()
    if (!timed) return
    const parts =
      timed.loadMs + timed.promptEvalMs + timed.evalMs + timed.otherMs + timed.unaccountedMs
    expect(timed.wallMs).toBe(parts)
  })

  it('leaves an unfinished call out of timed', () => {
    const unfinished = ollamaCall({
      seq: 3,
      rate: 50,
      durationMs: 800,
      ollama: {
        attempts: [attempt({ done: false, totalMs: null })],
        unaccountedMs: null,
        promptCacheSuspected: false,
      },
    })
    const block = ollamaSummary([rowA, unfinished])
    expect(block?.calls).toBe(2)
    expect(block?.timed.calls).toBe(1)
    expect(block?.timed.wallMs).toBe(1000)
  })

  it('counts cacheSuspected', () => {
    const suspected = ollamaCall({
      seq: 4,
      rate: 50,
      ollama: {
        attempts: [attempt({})],
        unaccountedMs: 0,
        promptCacheSuspected: true,
      },
    })
    expect(ollamaSummary([rowA, suspected])?.cacheSuspected).toBe(1)
  })

  it('is null when no call has an ollama block', () => {
    const cloud = baseline()
    expect(ollamaSummary(cloud)).toBeNull()
    expect('ollama' in speedSummary(cloud)).toBe(false)
  })
})

describe('speedSummary new blocks', () => {
  it('keeps the new blocks through the SpeedSchema', () => {
    const calls = [
      ...baseline().slice(0, 4),
      ollamaCall({ seq: 5, rate: 69, ollama: slowRowOllama() }),
    ]
    const speed = speedSummary(calls)
    expect(speed).toHaveProperty('slow')
    expect(speed).toHaveProperty('ollama')
    expect(RunSummarySchema.shape.speed.parse(speed)).toEqual(speed)
  })

  it('still parses an old speed object without the new blocks', () => {
    // Wall-clock calls have no Ollama rate, so neither block applies.
    const speed = speedSummary([1, 2, 3, 4, 5].map((seq) => call({ seq })))
    expect(speed).not.toHaveProperty('slow')
    expect(speed).not.toHaveProperty('ollama')
    expect(RunSummarySchema.shape.speed.parse(speed)).toEqual(speed)
  })
})

function slowRowOllama(): CallRecord['ollama'] {
  return {
    attempts: [attempt({ totalMs: 1000, loadMs: 0, promptEvalMs: 0, evalMs: 900, otherMs: 100 })],
    unaccountedMs: 0,
    promptCacheSuspected: false,
  }
}
