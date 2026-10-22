import { describe, expect, it } from 'vitest'
import { expansionRejection } from '@/ai/tasks/draft-expand'

// Stage 2 (review fix 5): an expansion that echoes the requests block is a note to the author.

const ORIGINAL = '서윤은 문을 열었다. 바람이 방 안으로 불었다.'

describe('expansionRejection and the requests block', () => {
  it('rejects an expansion that echoes an <author_requests> line', () => {
    const expanded = `${ORIGINAL}\n<author_requests>\n서윤은 천천히 고개를 들어 창밖을 보았다.`
    expect(expansionRejection(ORIGINAL, expanded)).toBe('note')
  })

  it('rejects an expansion that echoes a </author_requests> line', () => {
    const expanded = `${ORIGINAL}\n서윤은 천천히 고개를 들어 창밖을 보았다.\n</author_requests>`
    expect(expansionRejection(ORIGINAL, expanded)).toBe('note')
  })
})
