import { describe, expect, it } from 'vitest'
import {
  CHAPTER_STATUS_LABEL,
  CHARACTER_FIELD_LABELS,
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  ISSUE_KIND_LABEL,
  PROPOSAL_SOURCE_LABEL,
  PROPOSAL_TYPE_LABEL,
  ROLE_LABEL,
  THREAD_EVENT_LABEL,
  THREAD_STATUS_LABEL,
  chapterLabel,
} from '@/lib/labels'

describe('labels', () => {
  it('maps database enum values to Korean labels', () => {
    expect(ENTRY_KIND_LABEL.character).toBe('인물')
    expect(FACT_STATUS_LABEL.undecided).toBe('미정')
    expect(THREAD_STATUS_LABEL.developing).toBe('발전 중')
    expect(THREAD_EVENT_LABEL.note).toBe('메모')
    expect(ROLE_LABEL.commenter).toBe('코멘트 작성자')
    expect(ISSUE_KIND_LABEL.naming).toBe('표기 불일치')
    expect(PROPOSAL_TYPE_LABEL.style_card).toBe('문체 카드')
    expect(PROPOSAL_SOURCE_LABEL.post_chapter).toBe('회차 점검')
    expect(CHAPTER_STATUS_LABEL.done).toBe('완료')
  })

  it('has the character and place field labels', () => {
    expect(CHARACTER_FIELD_LABELS.speech).toBe('말투')
  })

  it('chapterLabel prints the position and an optional title', () => {
    expect(chapterLabel(3)).toBe('3화')
    expect(chapterLabel(3, null)).toBe('3화')
    expect(chapterLabel(3, '  ')).toBe('3화')
    expect(chapterLabel(3, '재회')).toBe('3화 재회')
  })
})
