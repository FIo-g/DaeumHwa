import { describe, expect, it } from 'vitest'
import { probeTtl } from './probe-gateway'

function usage(write = 0, read = 0) {
  return { inputTokens: 2100, outputTokens: 3, cacheWriteTokens: write, cacheReadTokens: read }
}

describe('probeTtl', () => {
  it('reports accepted false for a 400 naming ttl', async () => {
    const error = Object.assign(new Error("Unknown parameter: 'ttl'."), { status: 400 })
    let calls = 0
    const result = await probeTtl({
      ttl: '1h',
      gapSeconds: 400,
      send: async () => {
        calls += 1
        throw error
      },
      sleep: async () => undefined,
    })
    expect(result).toEqual({
      ttl: '1h',
      gapSeconds: 400,
      firstWrite: 0,
      secondRead: 0,
      accepted: false,
    })
    expect(calls).toBe(1)
  })

  it('sends twice with a gap and reports the cache counters', async () => {
    const slept: number[] = []
    const usages = [usage(2048, 0), usage(100, 1800)]
    let index = 0
    const result = await probeTtl({
      ttl: '1h',
      gapSeconds: 400,
      send: async () => ({ usage: usages[index++] }),
      sleep: async (ms: number) => {
        slept.push(ms)
      },
    })
    expect(result).toEqual({
      ttl: '1h',
      gapSeconds: 400,
      firstWrite: 2048,
      secondRead: 1800,
      accepted: true,
    })
    expect(slept).toEqual([400_000])
  })
})
