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
  stripEpisodePrefix,
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

  it('stripEpisodePrefix removes a leading episode number only at a boundary', () => {
    expect(stripEpisodePrefix('1화')).toBe('')
    expect(stripEpisodePrefix('1화 00:00 멈춘 종')).toBe('00:00 멈춘 종')
    expect(stripEpisodePrefix('제3화: 재회')).toBe('재회')
    expect(stripEpisodePrefix('12화살의 비밀')).toBe('12화살의 비밀')
    expect(stripEpisodePrefix('재회')).toBe('재회')
  })

  it('chapterLabel does not repeat a number already in the title', () => {
    expect(chapterLabel(1, '1화')).toBe('1화')
    expect(chapterLabel(1, '1화 멈춘 종')).toBe('1화 멈춘 종')
    expect(chapterLabel(3, '재회')).toBe('3화 재회')
    expect(chapterLabel(2, '')).toBe('2화')
  })

  it('strips only the chapter own number when a position is given', () => {
    expect(stripEpisodePrefix('3화 이후의 이야기', 3)).toBe('이후의 이야기')
    expect(stripEpisodePrefix('제3화: 재회', 3)).toBe('재회')
    expect(stripEpisodePrefix('2화 이후의 이야기', 3)).toBe('2화 이후의 이야기')
    expect(stripEpisodePrefix('5화 끝', 3)).toBe('5화 끝')
  })

  it('chapterLabel keeps a title whose leading number is another chapter number', () => {
    expect(chapterLabel(12, '1화 회상')).toBe('12화 1화 회상')
    expect(chapterLabel(12, '12화 기념 특집')).toBe('12화 기념 특집')
    expect(chapterLabel(3, '2화 이후의 이야기')).toBe('3화 2화 이후의 이야기')
  })
})
