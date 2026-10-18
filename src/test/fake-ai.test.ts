import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { InterviewQuestionInput } from '@/ai/tasks/interview-question'
import { FakeAiClient } from '@/test/fake-ai'

const emptyQuestionInput: InterviewQuestionInput = {
  work: { title: '새벽의 검', genre: '무협', logline: '복수를 다짐한 검객', synopsis: '' },
  wiki: {
    counts: {
      character: 0,
      place: 0,
      organization: 0,
      item: 0,
      rule: 0,
      event: 0,
      term: 0,
      other: 0,
    },
    entryNames: [],
    openThreadTitles: [],
  },
  history: [],
}

const questionTask = { name: 'interview-question' as const, input: emptyQuestionInput }

describe('FakeAiClient', () => {
  it('answers generateObject with the registry output for the task', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      task: questionTask,
      system: 's',
      prompt: 'p',
      schema: z.object({ topic: z.string(), question: z.string(), rationale: z.string() }),
      effort: 'low',
      maxTokens: 100,
    })
    expect(result.object.topic).toBe('주인공')
    expect(result.object.question).toBe(
      '주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?',
    )
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(client.provider).toBe('test')
    expect(client.defaultModel).toBe('fake')
  })

  it('validates the output against the schema', async () => {
    const client = new FakeAiClient({
      overrides: { 'interview-question': () => ({ topic: 1 }) },
    })
    await expect(
      client.generateObject({
        task: questionTask,
        system: 's',
        prompt: 'p',
        schema: z.object({ topic: z.string() }),
        effort: 'low',
        maxTokens: 100,
      }),
    ).rejects.toThrow()
  })

  it('overrides win over the registry', async () => {
    const client = new FakeAiClient({
      overrides: {
        'interview-question': () => ({ topic: '떡밥', question: 'q', rationale: 'r' }),
      },
    })
    const result = await client.generateObject({
      task: questionTask,
      system: 's',
      prompt: 'p',
      schema: z.object({ topic: z.string() }),
      effort: 'low',
      maxTokens: 100,
    })
    expect(result.object.topic).toBe('떡밥')
  })

  it('answers a registered task and throws for an unknown one', async () => {
    const client = new FakeAiClient()
    await expect(
      client.generateObject({
        task: { name: 'style-suggest', input: { entryName: '서윤', samples: [] } },
        system: 's',
        prompt: 'p',
        schema: z.object({}),
        effort: 'low',
        maxTokens: 100,
      }),
    ).resolves.toBeDefined()
    await expect(
      new FakeAiClient().generateObject({
        task: { name: 'nope' as never, input: {} },
        system: 's',
        prompt: 'p',
        schema: z.object({}),
        effort: 'low',
        maxTokens: 100,
      }),
    ).rejects.toThrow('No fake output for task nope')
  })

  it('streamText joins back to the full fake text in chunks of at most 40 characters', async () => {
    const text = '가'.repeat(100) + ' 나다라마바사 아자차카타파하. '.repeat(10)
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text } })
    const { textStream, final } = client.streamText({
      task: { name: 'draft-chapter', input: { instructions: '' } },
      system: 's',
      prompt: 'p',
      effort: 'medium',
      maxTokens: 100,
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
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => 'hello' } })
    const { final } = client.streamText({
      task: { name: 'draft-chapter', input: { instructions: '' } },
      system: 's',
      prompt: 'p',
      effort: 'medium',
      maxTokens: 100,
    })
    await expect(final).resolves.toMatchObject({ text: 'hello' })
  })

  it('streamText throws for a task with no fake text', () => {
    const client = new FakeAiClient()
    expect(() =>
      client.streamText({
        task: { name: 'nope' as never, input: {} },
        system: 's',
        prompt: 'p',
        effort: 'medium',
        maxTokens: 100,
      }),
    ).toThrow('No fake output for task nope')
  })
})
