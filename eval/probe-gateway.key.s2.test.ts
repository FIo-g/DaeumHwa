import { describe, expect, it } from 'vitest'
import { probeCacheKey } from './probe-gateway'

const BASE_URL = 'https://gateway.test/v1'

function fetchReturning(status: number, body: unknown, bodies: Record<string, unknown>[] = []) {
  return (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(text, { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('probeCacheKey', () => {
  it('sends the fixed probe key on the Responses path', async () => {
    const bodies: Record<string, unknown>[] = []
    await probeCacheKey(fetchReturning(200, {}, bodies), {
      baseUrl: BASE_URL,
      apiKey: 'key',
      model: 'stub-model',
    })
    expect(bodies[0].prompt_cache_key).toBe('daeumhwa-probe')
  })

  it('reports the key rejected for a 400 that names prompt_cache_key', async () => {
    const result = await probeCacheKey(
      fetchReturning(400, { error: { message: "Unknown parameter: 'prompt_cache_key'." } }),
      { baseUrl: BASE_URL, apiKey: 'key', model: 'stub-model' },
    )
    expect(result.cacheKeyAccepted).toBe(false)
  })

  it('reports the key accepted for a 200', async () => {
    const result = await probeCacheKey(fetchReturning(200, { id: 'resp_1' }), {
      baseUrl: BASE_URL,
      apiKey: 'key',
      model: 'stub-model',
    })
    expect(result.cacheKeyAccepted).toBe(true)
  })
})
