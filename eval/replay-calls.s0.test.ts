import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_TOKENS_MESSAGE } from '@/ai/anthropic'
import { AppError } from '@/lib/errors'
import { FakeAiClient } from '@/test/fake-ai'
import { replayCalls } from './replay-calls'

// Saved chapter-extract call: the fields replayCalls reads, plus output.
function savedRecord(name: string, subject: string) {
  return {
    seq: 1,
    task: 'chapter-extract',
    system: `system ${name}`,
    prompt: `prompt ${name}`,
    taskMaxTokens: 8000,
    output: {
      summary: null,
      entries: [],
      facts: [
        {
          subjectName: subject,
          content: '서윤은 왼손잡이다',
          evidence: '',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
      threads: [],
      relations: [],
    },
  }
}

let runDir: string
beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), 'replay-calls-s0-'))
  const calls = join(runDir, 'calls')
  mkdirSync(calls)
  writeFileSync(join(calls, '001-chapter-extract.json'), JSON.stringify(savedRecord('a', '서윤')))
  writeFileSync(join(calls, '002-chapter-extract.json'), JSON.stringify(savedRecord('b', '서윤')))
  writeFileSync(join(calls, '003-draft.json'), JSON.stringify({ task: 'draft-chapter' }))
})

describe('replayCalls', () => {
  it('re-sends each saved chapter-extract call at the chosen effort and compares the output', async () => {
    const efforts: string[] = []
    const maxTokens: number[] = []
    const client = new FakeAiClient({
      overrides: {
        'chapter-extract': () => {
          return {
            summary: null,
            entries: [],
            facts: [
              {
                subjectName: '서윤',
                content: '서윤은 왼손잡이다',
                evidence: '',
                suggestedStatus: 'confirmed',
                supersedesFactRef: null,
              },
            ],
            threads: [],
            relations: [],
          }
        },
      },
    })
    const original = client.generateObject.bind(client)
    client.generateObject = async (args) => {
      efforts.push(args.effort)
      maxTokens.push(args.maxTokens)
      return original(args)
    }

    const report = await replayCalls({
      runs: [runDir],
      task: 'chapter-extract',
      effort: 'low',
      client,
      model: 'fake',
    })

    expect(report.task).toBe('chapter-extract')
    expect(report.model).toBe('fake')
    expect(report.effort).toBe('low')
    expect(report.items).toHaveLength(2)
    expect(efforts).toEqual(['low', 'low'])
    expect(maxTokens).toEqual([8000, 8000])
    for (const item of report.items) {
      expect(item.error).toBeUndefined()
      expect(item.compare).not.toBeNull()
      expect(item.compare?.matchedFacts).toBe(1)
    }
    expect(report.totals.durationMs).toBeGreaterThanOrEqual(0)
    expect(readdirSync(join(runDir, 'calls')).length).toBe(3)
  })

  it('falls back to 16000 tokens when a saved record has no taskMaxTokens', async () => {
    const calls = join(runDir, 'calls')
    writeFileSync(
      join(calls, '004-chapter-extract.json'),
      JSON.stringify({ ...savedRecord('c', '서윤'), taskMaxTokens: undefined }),
    )
    const seen: number[] = []
    const client = new FakeAiClient()
    const original = client.generateObject.bind(client)
    client.generateObject = async (args) => {
      seen.push(args.maxTokens)
      return original(args)
    }
    const report = await replayCalls({
      runs: [runDir],
      task: 'chapter-extract',
      effort: 'medium',
      client,
      model: 'fake',
    })
    expect(report.items).toHaveLength(3)
    expect(seen).toContain(16000)
  })
})

describe('replayCalls failed calls', () => {
  const validOutput = {
    summary: null,
    entries: [],
    facts: [
      {
        subjectName: '서윤',
        content: '서윤은 왼손잡이다',
        evidence: '',
        suggestedStatus: 'confirmed',
        supersedesFactRef: null,
      },
    ],
    threads: [],
    relations: [],
  }

  it('counts the tokens a failed call was billed for', async () => {
    let calls = 0
    const client = new FakeAiClient({ overrides: { 'chapter-extract': () => validOutput } })
    const original = client.generateObject.bind(client)
    client.generateObject = async (args) => {
      calls += 1
      if (calls === 1) {
        throw new AppError('AI_ERROR', MAX_TOKENS_MESSAGE, {
          usage: { inputTokens: 100, outputTokens: 16000 },
        })
      }
      return original(args)
    }

    const report = await replayCalls({
      runs: [runDir],
      task: 'chapter-extract',
      effort: 'high',
      client,
      model: 'fake',
    })

    expect(report.items[0].usage).toEqual({ inputTokens: 100, outputTokens: 16000 })
    expect(report.items[0].error).toBe(MAX_TOKENS_MESSAGE)
    expect(report.items[0].compare).toBeNull()
    const secondOutput = report.items[1].usage?.outputTokens ?? 0
    expect(report.totals.outputTokens).toBe(16000 + secondOutput)
  })

  it('records null usage for an error that carries no billed tokens', async () => {
    let calls = 0
    const client = new FakeAiClient({ overrides: { 'chapter-extract': () => validOutput } })
    const original = client.generateObject.bind(client)
    client.generateObject = async (args) => {
      calls += 1
      if (calls === 1) throw new Error('x')
      return original(args)
    }

    const report = await replayCalls({
      runs: [runDir],
      task: 'chapter-extract',
      effort: 'high',
      client,
      model: 'fake',
    })

    expect(report.items[0].usage).toBeNull()
    expect(report.items[0].error).toBe('x')
  })
})
