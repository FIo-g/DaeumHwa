import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { parseProposalPayload } from '@/lib/proposal-payloads'

const validFactPayload = {
  subjectName: '이서윤',
  entryId: null,
  content: '서윤은 열일곱 살이다.',
  suggestedStatus: 'confirmed',
  sourceChapterId: null,
  evidence: '열일곱 살의 서윤은',
  supersedesFactId: null,
}

describe('parseProposalPayload', () => {
  it('accepts a valid fact_create payload', () => {
    const parsed = parseProposalPayload('fact_create', validFactPayload)
    expect(parsed.content).toBe('서윤은 열일곱 살이다.')
    expect(parsed.supersedesFactId).toBeNull()
  })

  it('throws AppError VALIDATION when supersedesFactId is missing', () => {
    const withoutSupersedes: Record<string, unknown> = { ...validFactPayload }
    delete withoutSupersedes.supersedesFactId
    let caught: unknown = null
    try {
      parseProposalPayload('fact_create', withoutSupersedes)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe('VALIDATION')
    expect((caught as AppError).message).toBe('제안 내용 형식이 올바르지 않습니다.')
  })

  it('accepts thread_create with nested events and rejects an unknown event kind', () => {
    const base = {
      title: '잃어버린 반지',
      description: '할머니의 반지가 사라졌다.',
      status: 'planted',
      plantedChapterId: null,
      targetChapterPosition: 12,
      importance: 'high',
      relatedNames: ['이서윤'],
      evidence: '반지가 없다.',
    }
    expect(
      parseProposalPayload('thread_create', {
        ...base,
        events: [
          {
            kind: 'developed',
            chapterId: '00000000-0000-0000-0000-000000000001',
            evidence: '단서',
          },
        ],
      }).events,
    ).toHaveLength(1)

    expect(() =>
      parseProposalPayload('thread_create', {
        ...base,
        events: [
          {
            kind: 'discarded',
            chapterId: '00000000-0000-0000-0000-000000000001',
            evidence: '단서',
          },
        ],
      }),
    ).toThrow(AppError)
  })

  it('accepts entry_update with a partial patch', () => {
    const parsed = parseProposalPayload('entry_update', {
      entryId: '00000000-0000-0000-0000-000000000002',
      entryName: '이서윤',
      patch: { summary: '주인공' },
    })
    expect(parsed.patch.summary).toBe('주인공')
    expect(parsed.patch.fields).toBeUndefined()
  })
})
