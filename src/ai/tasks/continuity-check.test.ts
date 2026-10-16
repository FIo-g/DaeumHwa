import { describe, expect, it } from 'vitest'
import type { ContextPack } from '@/ai/context'
import { continuityCheckTask, resolveContinuityIssues } from '@/ai/tasks/continuity-check'

const pack: ContextPack = {
  position: 1,
  entries: [
    {
      ref: 'E1',
      id: 'entry-1',
      kind: 'character',
      name: '서윤',
      aliases: [],
      summary: '',
      fields: {},
      mentionCount: 1,
      facts: [
        {
          ref: 'F1',
          id: 'fact-1',
          content: '서윤은 왼손잡이다.',
          status: 'confirmed',
          sourcePosition: null,
          validFromPosition: null,
          validToPosition: null,
          evidence: '',
        },
      ],
    },
  ],
  threads: [],
  relations: [],
  previousSummaries: [],
  namingRules: [],
  stats: { totalEntries: 1, selectedEntries: 1, approxChars: 0 },
}

const chapterText = '서윤은 오른손으로 검을 쥐었다.'
const input = { chapterText, chapterPosition: 1, chapterTitle: '1화', pack }

function issue(
  overrides: Partial<{
    quote: string
    factRef: string | null
    entryRef: string | null
    explanation: string
  }>,
) {
  return {
    quote: chapterText,
    kind: 'contradiction' as const,
    severity: 'medium' as const,
    factRef: 'F1',
    entryRef: null,
    wikiExcerpt: '서윤은 왼손잡이다.',
    explanation: '손잡이가 다릅니다.',
    suggestion: '서윤은 왼손으로 검을 쥐었다.',
    ...overrides,
  }
}

describe('continuityCheckTask.postProcess', () => {
  it('drops an issue whose quote cannot be located', () => {
    const processed = continuityCheckTask.postProcess?.(
      { issues: [issue({ quote: '원고에 없는 문장입니다.' })] },
      input,
    )
    expect(processed?.issues).toEqual([])
  })

  it('nulls an unknown factRef and drops the issue when there is no entryRef', () => {
    const dropped = continuityCheckTask.postProcess?.(
      { issues: [issue({ factRef: 'F9', entryRef: null })] },
      input,
    )
    expect(dropped?.issues).toEqual([])

    const kept = continuityCheckTask.postProcess?.(
      { issues: [issue({ factRef: 'F9', entryRef: 'E1' })] },
      input,
    )
    expect(kept?.issues).toHaveLength(1)
    expect(kept?.issues[0].factRef).toBeNull()
    expect(kept?.issues[0].entryRef).toBe('E1')
  })

  it('keeps a valid fact ref and resolveContinuityIssues maps it to the fact id with offsets', () => {
    const output = continuityCheckTask.postProcess?.({ issues: [issue({})] }, input)
    expect(output).toBeDefined()
    const resolved = resolveContinuityIssues(output as NonNullable<typeof output>, input)
    expect(resolved).toEqual([
      {
        quote: chapterText,
        start: 0,
        end: chapterText.length,
        kind: 'contradiction',
        severity: 'medium',
        factId: 'fact-1',
        entryId: 'entry-1',
        wikiExcerpt: '서윤은 왼손잡이다.',
        explanation: '손잡이가 다릅니다.',
        suggestion: '서윤은 왼손으로 검을 쥐었다.',
      },
    ])
  })

  it('dedupes issues that point at the same located range', () => {
    const processed = continuityCheckTask.postProcess?.(
      { issues: [issue({}), issue({ explanation: '다른 설명' })] },
      input,
    )
    expect(processed?.issues).toHaveLength(1)
  })
})

describe('continuityCheckTask fake', () => {
  it('flags a left/right hand contradiction quoting the manuscript sentence', () => {
    const output = continuityCheckTask.schema.parse(continuityCheckTask.fake(input))
    expect(output.issues).toHaveLength(1)
    expect(output.issues[0]).toMatchObject({
      quote: chapterText,
      kind: 'contradiction',
      severity: 'medium',
      factRef: 'F1',
      entryRef: 'E1',
    })
  })

  it('returns no issues when nothing in the wiki contradicts the manuscript', () => {
    const quiet = { ...input, chapterText: '서윤이 웃었다.' }
    expect(continuityCheckTask.fake(quiet).issues).toEqual([])
  })

  it('has the Korean system prompt and the wiki and manuscript layout', () => {
    expect(
      continuityCheckTask.system.startsWith(
        '당신은 장기 연재 웹소설의 설정 오류(오기)를 찾는 교정자다.',
      ),
    ).toBe(true)
    const prompt = continuityCheckTask.buildPrompt(input)
    expect(prompt).toContain('<wiki>')
    expect(prompt).toContain('<manuscript position="1" title="1화">')
    expect(prompt).toContain(chapterText)
  })
})
