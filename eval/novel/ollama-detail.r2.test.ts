import { describe, expect, it } from 'vitest'
import type { OllamaAttempt } from '@/ai/ollama'
import { PROMPT_RATE_CEILING, callOllama, promptRateSuspect, unaccountedMs } from './ollama-detail'

function attemptFor(fields: Partial<OllamaAttempt> = {}): OllamaAttempt {
  return {
    task: 'proofread',
    model: 'qwen3.5:9b',
    attempt: 1,
    done: true,
    doneReason: 'stop',
    loadMs: 0,
    promptEvalMs: 0,
    evalMs: 0,
    totalMs: 0,
    otherMs: 0,
    promptEvalCount: 10,
    evalCount: 5,
    thinkingChunks: 0,
    thinkingChars: 0,
    ...fields,
  }
}

describe('promptRateSuspect', () => {
  it('flags only rates strictly above the ceiling, and unusable prompt counts or times', () => {
    expect(PROMPT_RATE_CEILING).toBe(5000)
    expect(promptRateSuspect(1000, 2000)).toBe(false)
    expect(promptRateSuspect(1000, 200)).toBe(false)
    expect(promptRateSuspect(1000, 199)).toBe(true)
    expect(promptRateSuspect(5860, 716)).toBe(true)
    expect(promptRateSuspect(2066, 0)).toBe(true)
    expect(promptRateSuspect(0, 100)).toBe(true)
  })
})

describe('unaccountedMs', () => {
  it('subtracts the Ollama total of the attempts from the wall time', () => {
    expect(unaccountedMs(31597, [attemptFor({ totalMs: 1400 })])).toBe(30197)
    expect(unaccountedMs(1000, [attemptFor({ totalMs: 300 }), attemptFor({ totalMs: 200 })])).toBe(
      500,
    )
  })

  it('keeps the sign when Ollama reports more time than the wall clock', () => {
    expect(unaccountedMs(100, [attemptFor({ totalMs: 130 })])).toBe(-30)
  })

  it('is null when an attempt did not finish or has no total', () => {
    expect(unaccountedMs(1000, [attemptFor({ done: false, totalMs: null })])).toBeNull()
    expect(
      unaccountedMs(1000, [
        attemptFor({ totalMs: 100 }),
        attemptFor({ done: true, totalMs: null }),
      ]),
    ).toBeNull()
  })

  it('is null without attempts', () => {
    expect(unaccountedMs(1000, [])).toBeNull()
  })
})

describe('callOllama', () => {
  it('is undefined without attempts', () => {
    expect(
      callOllama({ durationMs: 1000, attempts: [], promptCacheSuspected: false }),
    ).toBeUndefined()
  })

  it('returns the attempts, the unaccounted time and the cache flag', () => {
    const attempts = [attemptFor({ totalMs: 600 })]
    expect(callOllama({ durationMs: 1000, attempts, promptCacheSuspected: true })).toEqual({
      attempts,
      unaccountedMs: 400,
      promptCacheSuspected: true,
    })
  })
})
