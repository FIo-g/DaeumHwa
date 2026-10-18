import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AnthropicAiClient } from '@/ai/anthropic'
import { proofreadTask } from '@/ai/tasks/proofread'
import { createStubServer } from './stub'

// Runs the stub on an ephemeral port and drives it through the real AnthropicAiClient, so the
// request paths the SDK really sends are the ones the stub must answer.

let server: Server
let baseUrl: string
const requestedUrls: string[] = []

beforeAll(async () => {
  server = createStubServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

/** An SDK client that records every URL it requests before passing the call on. */
function clientFor(model: string) {
  const sdk = new Anthropic({
    apiKey: 'stub',
    baseURL: baseUrl,
    maxRetries: 0,
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      requestedUrls.push(String(input))
      return fetch(input, init)
    },
  })
  return new AnthropicAiClient(sdk, model)
}

function proofreadCall(model: string) {
  const input = { text: '서윤은 시계탑 앞에 섰다.' }
  return {
    task: { name: proofreadTask.name, input },
    system: proofreadTask.system,
    prompt: proofreadTask.buildPrompt(input),
    schema: proofreadTask.schema,
    effort: proofreadTask.effort,
    maxTokens: proofreadTask.maxTokens,
    model,
  }
}

describe('AI stub through the real AnthropicAiClient', () => {
  it('answers the plain Messages path for a model without server fallback', async () => {
    requestedUrls.length = 0
    const result = await clientFor('claude-haiku-5-5').generateObject(
      proofreadCall('claude-haiku-5-5'),
    )
    expect(result.object).toEqual({ suggestions: [] })
    expect(requestedUrls).toHaveLength(1)
    const url = new URL(requestedUrls[0] ?? '')
    expect(url.pathname).toBe('/v1/messages')
    expect(url.search).toBe('')
  })

  it('answers the beta Messages path (?beta=true) for a fallback-capable model', async () => {
    requestedUrls.length = 0
    const result = await clientFor('claude-sonnet-5-5').generateObject(
      proofreadCall('claude-sonnet-5-5'),
    )
    expect(result.object).toEqual({ suggestions: [] })
    expect(requestedUrls).toHaveLength(1)
    const url = new URL(requestedUrls[0] ?? '')
    expect(url.pathname).toBe('/v1/messages')
    expect(url.searchParams.get('beta')).toBe('true')
  })

  it('answers the health check even with a query string', async () => {
    const res = await fetch(`${baseUrl}/health?probe=1`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('returns 404 for an unknown path', async () => {
    const res = await fetch(`${baseUrl}/v1/other`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
  })
})
