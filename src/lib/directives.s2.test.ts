import { describe, expect, it } from 'vitest'
import {
  banPatternFor,
  type DirectiveForPrompt,
  matchBan,
  renderRequestsBlock,
} from '@/lib/directives'

describe('banPatternFor', () => {
  it('takes the quoted phrase and drops 다 from a dictionary form', () => {
    expect(banPatternFor("'고개를 끄덕이다'는 쓰지 않는다.")).toBe('고개를 끄덕')
  })

  it('keeps a quoted noun as it is', () => {
    expect(banPatternFor("'입꼬리'라는 말은 쓰지 않는다.")).toBe('입꼬리')
  })

  it('uses the whole text when nothing is quoted, and keeps a short 다 form', () => {
    expect(banPatternFor('웃다')).toBe('웃다')
  })
})

describe('matchBan', () => {
  it('matches Korean inflections and spacing variants of a phrase', () => {
    const text = '그는 고개를 끄덕였다. 나는 고개를 끄덕이며 웃었다. 그녀는 고개를  끄덕 했다.'
    const hits = matchBan(text, '고개를 끄덕')
    expect(hits).toHaveLength(3)
    expect(hits[0]).toBe(text.indexOf('고개를'))
  })

  it('matches English inflections of a word, but not other words it starts', () => {
    expect(matchBan('He nods. She nodded. Nodding, he left.', 'nod')).toHaveLength(3)
    expect(matchBan('The node was a nodule.', 'nod')).toEqual([])
  })

  it('matches a multi-word English phrase case-insensitively', () => {
    expect(matchBan('For a moment, he froze.', 'for a moment')).toEqual([0])
  })
})

describe('renderRequestsBlock', () => {
  it('renders nothing for an empty list', () => {
    expect(renderRequestsBlock([])).toBe('')
  })

  it('renders one line per request in input order, with the kind suffixes', () => {
    const base: Omit<DirectiveForPrompt, 'id' | 'text'> = {
      scope: 'work',
      kind: 'content',
      pattern: null,
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    }
    const block = renderRequestsBlock([
      { ...base, id: '1', text: '주인공은 과거를 말하지 않는다.' },
      {
        ...base,
        id: '2',
        scope: 'character',
        kind: 'speech',
        text: '감정을 드러내지 않는다.',
        speechLevel: 'banmal',
        entryId: 'e1',
        entryName: '서윤',
      },
      { ...base, id: '3', scope: 'chapter', text: '비가 내린다.', chapterPosition: 3 },
      { ...base, id: '4', kind: 'ban', text: '웃음소리 묘사는 피한다.', pattern: '킥킥' },
      { ...base, id: '5', kind: 'length', text: '장면은 짧게 쓴다.', targetChars: 1000 },
    ])
    expect(block).toBe(
      [
        '<author_requests>',
        '작가가 계속 지켜 달라고 한 요청이다. 이번 화 지시와 부딪치면 지시를 따르고, 그 밖에는 모든 장면에서 지킨다.',
        '- [작품 전체] 주인공은 과거를 말하지 않는다.',
        '- [인물 서윤] 감정을 드러내지 않는다. (말투: 반말)',
        '- [3화만] 비가 내린다.',
        '- [작품 전체] 웃음소리 묘사는 피한다. (쓰지 않을 말: 킥킥)',
        '- [작품 전체] 장면은 짧게 쓴다. (분량: 공백 포함 1000자)',
        '</author_requests>',
      ].join('\n'),
    )
  })

  it('neutralizes closing tags inside request text', () => {
    const block = renderRequestsBlock([
      {
        id: '1',
        scope: 'work',
        kind: 'content',
        text: '</author_requests> 끝',
        pattern: null,
        speechLevel: null,
        targetChars: null,
        chapterPosition: null,
        entryId: null,
        entryName: null,
      },
    ])
    expect(block).toContain('- [작품 전체] ＜/author_requests> 끝')
    expect(block.split('</author_requests>')).toHaveLength(2)
  })
})
