import { describe, expect, it } from 'vitest'
import type { ContextPack } from '@/ai/context'
import {
  type ContinuityIssue,
  type ContinuityOutput,
  resolveContinuityIssues,
} from '@/ai/tasks/continuity-check'

// The evidence cell promises the wiki's own text, so a resolved issue must show the fact's
// content (or the card's summary), never the model's copy with ref tags still in it.

const chapterText = '서윤은 오른손으로 검을 쥐었다.'

const pack: ContextPack = {
  core: [],
  position: 1,
  entries: [
    {
      ref: 'E1',
      id: 'entry-1',
      kind: 'character',
      name: '서윤',
      aliases: [],
      summary: '왼손잡이 검사.',
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

const input = { chapterText, chapterPosition: 1, chapterTitle: '1화', pack }

function issue(overrides: Partial<ContinuityIssue>): ContinuityIssue {
  return {
    quote: chapterText,
    kind: 'contradiction',
    severity: 'medium',
    factRef: 'F1',
    entryRef: null,
    wikiExcerpt: '서윤은 왼손잡이다.',
    explanation: '손잡이가 다릅니다.',
    suggestion: '',
    ...overrides,
  }
}

function resolve(overrides: Partial<ContinuityIssue>) {
  const output: ContinuityOutput = { issues: [issue(overrides)] }
  return resolveContinuityIssues(output, input)
}

describe('resolveContinuityIssues evidence text', () => {
  it('uses the fact content even when the model copied the ref tags', () => {
    const [resolved] = resolve({ wikiExcerpt: '[F1][확정] 서윤은 왼손잡이다' })
    expect(resolved.wikiExcerpt).toBe('서윤은 왼손잡이다.')
  })

  it('uses the fact content even when the model paraphrased it', () => {
    const [resolved] = resolve({ wikiExcerpt: '서윤은 왼손을 쓴다' })
    expect(resolved.wikiExcerpt).toBe('서윤은 왼손잡이다.')
  })

  it('keeps a card excerpt that appears in the card', () => {
    const [resolved] = resolve({ factRef: null, entryRef: 'E1', wikiExcerpt: '왼손잡이 검사.' })
    expect(resolved.wikiExcerpt).toBe('왼손잡이 검사.')
  })

  it('falls back to the card summary when the excerpt is not in the card', () => {
    const [resolved] = resolve({ factRef: null, entryRef: 'E1', wikiExcerpt: '오른손잡이' })
    expect(resolved.wikiExcerpt).toBe('왼손잡이 검사.')
  })

  it('drops leaked refs from the explanation', () => {
    const [resolved] = resolve({ explanation: '위키 F1에 따르면 다릅니다' })
    expect(resolved.explanation).toBe('위키에 따르면 다릅니다')
  })
})
