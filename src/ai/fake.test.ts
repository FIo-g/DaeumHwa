import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FakeAiClient } from '@/ai/fake'

describe('FakeAiClient', () => {
  it('generateObject returns the fake output after schema validation', async () => {
    const client = new FakeAiClient()
    const schema = z.object({ topic: z.string(), count: z.number().int() })
    const result = await client.generateObject({
      system: 's',
      prompt: 'p',
      schema,
      effort: 'low',
      maxTokens: 100,
      fake: () => ({ topic: '주인공', count: 2 }),
    })
    expect(result.object).toEqual({ topic: '주인공', count: 2 })
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(client.provider).toBe('fake')
    expect(client.defaultModel).toBe('fake')
  })

  it('generateObject throws when the fake output does not match the schema', async () => {
    const client = new FakeAiClient()
    const schema = z.object({ count: z.number() })
    await expect(
      client.generateObject({
        system: 's',
        prompt: 'p',
        schema,
        effort: 'low',
        maxTokens: 100,
        fake: () => ({ count: 'not a number' }) as unknown as { count: number },
      }),
    ).rejects.toThrow()
  })

  it('streamText joins back to the full fake text', async () => {
    const client = new FakeAiClient()
    const text = '가'.repeat(100) + ' 나다라마바사 아자차카타파하. '.repeat(10)
    const { textStream, final } = client.streamText({
      system: 's',
      prompt: 'p',
      effort: 'medium',
      maxTokens: 100,
      fake: () => text,
    })
    const chunks: string[] = []
    for await (const chunk of textStream) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(40)
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
    const finalResult = await final
    expect(finalResult.text).toBe(text)
    expect(finalResult.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('streamText resolves final even when the text stream is never read', async () => {
    const client = new FakeAiClient()
    const { final } = client.streamText({
      system: 's',
      prompt: 'p',
      effort: 'medium',
      maxTokens: 100,
      fake: () => 'hello',
    })
    await expect(final).resolves.toMatchObject({ text: 'hello' })
  })
})
