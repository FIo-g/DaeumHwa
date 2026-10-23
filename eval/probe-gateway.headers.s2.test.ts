import { describe, expect, it } from 'vitest'
import { opencodeHeaders } from '@/ai/opencode'
import { probeCacheKey } from './probe-gateway'

const BASE_URL = 'https://gateway.test/v1'

function recordingFetch(headers: Headers[]) {
  return (async (_url: string, init?: RequestInit) => {
    headers.push(new Headers(init?.headers))
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('probeCacheKey headers', () => {
  it('sends the OpenCode session header the product client sends', async () => {
    const seen: Headers[] = []
    await probeCacheKey(recordingFetch(seen), { baseUrl: BASE_URL, apiKey: 'key', model: 'm' })
    expect(seen[0].get('x-opencode-session')).toBeTruthy()
  })

  it('sends the same OpenCode headers as the product client', async () => {
    const seen: Headers[] = []
    await probeCacheKey(recordingFetch(seen), { baseUrl: BASE_URL, apiKey: 'key', model: 'm' })
    const product = opencodeHeaders()
    for (const [name, value] of Object.entries(product)) {
      expect(seen[0].get(name)).toBe(value)
    }
  })
})
