import { describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import { BLIND_LABEL, blindCallRecord, blindRunSummary } from './blind'

// Blind copy of the Ollama call record and of the summary speed block (track M2).

// Only the fields the blind copy reads are set; the rest is cast away.
function callRecord(fields: Partial<CallRecord>): CallRecord {
  return {
    seq: 1,
    task: 'continuity-check',
    step: 'ch1:check',
    model: 'local-model',
    durationMs: 1234,
    queueMs: 0,
    wouldTimeOut: true,
    output: null,
    system: '',
    prompt: '',
    ...fields,
  } as CallRecord
}

describe('blind copy of the Ollama block', () => {
  it('blindCallRecord drops the ollama block', () => {
    const input = callRecord({
      ollama: {
        attempts: [
          {
            task: 'continuity-check',
            model: 'local-model',
            attempt: 1,
            done: true,
            doneReason: 'stop',
            loadMs: 1,
            promptEvalMs: 2,
            evalMs: 3,
            totalMs: 6,
            otherMs: 0,
            promptEvalCount: 10,
            evalCount: 20,
            thinkingChunks: 0,
            thinkingChars: 0,
          },
        ],
        unaccountedMs: 5,
        promptCacheSuspected: false,
      },
    })
    const before = JSON.stringify(input)

    const blinded = blindCallRecord(input)

    expect(blinded).not.toHaveProperty('ollama')
    expect(Object.keys(blinded)).not.toContain(BLIND_LABEL)
    expect(blinded.durationMs).toBe(1234)
    expect(blinded.queueMs).toBe(0)
    expect(blinded.wouldTimeOut).toBe(true)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('blindRunSummary drops speed with its slow and ollama blocks', () => {
    const summary = {
      calls: { total: 1 },
      speed: {
        byTask: {},
        overall: { medianOutputTokensPerSec: 30, medianPromptTokensPerSec: 100, source: 'ollama' },
        perChapterMs: {},
        perChapterModelMs: {},
        slow: { thresholdRatio: 0.7, usualOutputTokensPerSec: 30, calls: [] },
        ollama: { calls: 1, attempts: 1, timed: { calls: 1, wallMs: 10 } },
      },
    }

    const blinded = blindRunSummary(summary) as Record<string, unknown>

    expect(blinded).not.toHaveProperty('speed')
    expect(blinded.calls).toEqual({ total: 1 })
  })
})
