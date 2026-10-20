import { describe, expect, it } from 'vitest'
import { DROPPED_PROOFREAD_KINDS, PROOFREAD_KINDS, proofreadTask } from '@/ai/tasks/proofread'

// Round 2 (P14): the server drops `awkward` suggestions before anything else sees them.

const text = '안 되요. 그건 좀 어색해요.'
const reason = '이유'

describe('proofread awkward filter (P14)', () => {
  it('postProcess drops awkward suggestions', () => {
    const processed = proofreadTask.postProcess?.(
      {
        suggestions: [
          { quote: '어색해요', replacement: '어색합니다', kind: 'awkward' as const, reason },
          { quote: '되요', replacement: '돼요', kind: 'spelling' as const, reason },
        ],
      },
      { text },
    )
    expect(processed?.suggestions).toEqual([
      { quote: '되요', replacement: '돼요', kind: 'spelling', reason },
    ])
  })

  it('an awkward item does not hide a later item for the same quote', () => {
    const processed = proofreadTask.postProcess?.(
      {
        suggestions: [
          { quote: '어색해요', replacement: '어색합니다', kind: 'awkward' as const, reason },
          { quote: '어색해요', replacement: '어색하군요', kind: 'grammar' as const, reason },
        ],
      },
      { text },
    )
    expect(processed?.suggestions).toHaveLength(1)
    expect(processed?.suggestions[0].kind).toBe('grammar')
    expect(processed?.suggestions[0].replacement).toBe('어색하군요')
  })

  it('an all-awkward answer gives an empty list', () => {
    const processed = proofreadTask.postProcess?.(
      {
        suggestions: [
          { quote: '어색해요', replacement: '어색합니다', kind: 'awkward' as const, reason },
          { quote: '좀', replacement: '조금', kind: 'awkward' as const, reason },
        ],
      },
      { text },
    )
    expect(processed?.suggestions).toEqual([])
  })

  it('spelling, spacing and grammar items are kept in model order', () => {
    const processed = proofreadTask.postProcess?.(
      {
        suggestions: [
          { quote: '되요', replacement: '돼요', kind: 'spelling' as const, reason },
          { quote: '그눈에', replacement: '그 눈에', kind: 'spacing' as const, reason },
          { quote: '사이 규칙', replacement: '사이의 규칙', kind: 'grammar' as const, reason },
        ],
      },
      { text: '되요. 그눈에. 사이 규칙.' },
    )
    expect(processed?.suggestions.map((s) => [s.kind, s.quote])).toEqual([
      ['spelling', '되요'],
      ['spacing', '그눈에'],
      ['grammar', '사이 규칙'],
    ])
  })

  it('the schema still accepts awkward', () => {
    const parsed = proofreadTask.schema.safeParse({
      suggestions: [{ quote: 'a', replacement: 'b', kind: 'awkward', reason: 'r' }],
    })
    expect(parsed.success).toBe(true)
    expect(PROOFREAD_KINDS).toContain('awkward')
    expect(DROPPED_PROOFREAD_KINDS).toEqual(['awkward'])
  })

  it('the system prompt is not changed by this track', () => {
    expect(proofreadTask.system).toContain('awkward는 문장이 문법상 성립하지 않을 때만 쓴다.')
  })
})
