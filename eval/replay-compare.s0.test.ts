import { describe, expect, it } from 'vitest'
import type { Extraction } from '@/ai/extraction'
import { compareExtraction } from './replay-compare'

// Minimal extraction with only the parts compareExtraction reads.
function extraction(parts: {
  facts?: { subjectName: string; content: string }[]
  threads?: { title: string }[]
}): Extraction {
  return {
    summary: null,
    entries: [],
    facts: (parts.facts ?? []).map((f) => ({
      subjectName: f.subjectName,
      content: f.content,
      evidence: '',
      suggestedStatus: 'confirmed',
      supersedesFactRef: null,
    })),
    threads: (parts.threads ?? []).map((t) => ({
      title: t.title,
      description: '',
      kind: 'planted',
      evidence: '',
      existingThreadRef: null,
      targetChapterPosition: null,
    })),
    relations: [],
  } as unknown as Extraction
}

describe('compareExtraction', () => {
  it('matches facts with the same subject and similar wording', () => {
    const ref = extraction({
      facts: [
        { subjectName: '서윤', content: '서윤은 왼손잡이다' },
        { subjectName: '서윤', content: '서윤은 검술을 배웠다' },
        { subjectName: '레이아', content: '레이아는 바다를 무서워한다' },
      ],
    })
    const out = extraction({
      facts: [
        { subjectName: '서윤', content: '서윤은 왼손잡이이다' },
        { subjectName: '서윤', content: '서윤은 검술을 익혔다' },
        { subjectName: '시우', content: '시우는 바다를 무서워한다' },
      ],
    })
    const result = compareExtraction(ref, out)
    expect(result.refFacts).toBe(3)
    expect(result.facts).toBe(3)
    expect(result.matchedFacts).toBe(2)
  })

  it('never matches one reference fact to two outputs', () => {
    const ref = extraction({ facts: [{ subjectName: '서윤', content: '서윤은 왼손잡이다' }] })
    const out = extraction({
      facts: [
        { subjectName: '서윤', content: '서윤은 왼손잡이다' },
        { subjectName: '서윤', content: '서윤은 왼손잡이다' },
      ],
    })
    const result = compareExtraction(ref, out)
    expect(result.matchedFacts).toBe(1)
    expect(result.facts).toBe(2)
  })

  it('matches threads on title', () => {
    const ref = extraction({ threads: [{ title: '검의 정체' }, { title: '사라진 동생' }] })
    const out = extraction({ threads: [{ title: '검의 정체는?' }, { title: '전혀 다른 떡밥' }] })
    const result = compareExtraction(ref, out)
    expect(result.refThreads).toBe(2)
    expect(result.threads).toBe(2)
    expect(result.matchedThreads).toBe(1)
  })
})
