import { describe, expect, it } from 'vitest'
import { evidenceOf, summarizeProposal } from './proposal-summary'

describe('summarizeProposal', () => {
  it('names the card kind and lists its aliases', () => {
    expect(
      summarizeProposal('entry_create', {
        kind: 'character',
        name: '이서윤',
        aliases: ['서윤'],
        summary: '주인공',
        fields: {},
      }),
    ).toEqual({ headline: "인물 '이서윤' 추가 (별칭: 서윤)", detail: '주인공' })
  })

  it('marks a fact that replaces an older one as changing from a chapter', () => {
    const summary = summarizeProposal('fact_create', {
      subjectName: '이서윤',
      entryId: null,
      content: '열일곱 살이다',
      suggestedStatus: 'confirmed',
      sourceChapterId: 'c2',
      evidence: '',
      supersedesFactId: 'f1',
    })
    expect(summary.headline).toBe('열일곱 살이다')
    expect(summary.detail).toBe('대상: 이서윤 · 이 회차부터 바뀜')
  })

  it('lists the changed parts of an entry update', () => {
    const summary = summarizeProposal('entry_update', {
      entryId: 'e1',
      entryName: '이서윤',
      patch: { summary: '새 요약', fields: { age: '17' } },
    })
    expect(summary.headline).toBe("'이서윤' 카드 수정")
    expect(summary.detail).toBe('바뀌는 내용: 요약, 설정 항목')
  })

  it('tolerates a payload that is not an object', () => {
    expect(summarizeProposal('chapter_summary', null)).toEqual({
      headline: '회차 요약',
      detail: null,
    })
  })
})

describe('evidenceOf', () => {
  it('returns the source sentence for fact proposals and null for summaries', () => {
    expect(
      evidenceOf('fact_create', {
        subjectName: '',
        entryId: null,
        content: '',
        suggestedStatus: 'undecided',
        sourceChapterId: null,
        evidence: '그는 칼을 뽑았다.',
        supersedesFactId: null,
      }),
    ).toBe('그는 칼을 뽑았다.')
    expect(evidenceOf('chapter_summary', { chapterId: 'c1', summary: '' })).toBeNull()
  })
})
