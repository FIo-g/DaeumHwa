import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Stage 0 fixes F10 and F12: few-instruction runs judge T1 against the blind copy's chapter events,
// and the author judges events only against the pending's mustInclude list.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const reviewerMd = read('./agents/reviewer.md')
const authorMd = read('./agents/author.md')
const criteriaMd = read('../../docs/eval/novel-quality-criteria.md')
const koGuide = read('../fixtures/novel/ko/author-guide.md')
const enGuide = read('../fixtures/novel/en/author-guide.md')

describe('reviewer judges T1 against the chapter events (F10)', () => {
  it('names chapter-events.json and T1 in reviewer.md', () => {
    expect(reviewerMd).toContain('chapter-events.json')
    expect(reviewerMd).toContain('T1')
  })

  it('names chapter-events.json in the criteria T1 row', () => {
    expect(criteriaMd).toContain('chapter-events.json')
  })
})

describe('author checks events only against the pending list (F12)', () => {
  it('says so in author.md', () => {
    expect(authorMd).toContain('never against the bible')
    expect(authorMd).toContain('skip the event check')
  })

  it('says so in the ko author guide', () => {
    expect(koGuide).toContain('pending.json의 mustInclude 목록만 본다')
    expect(koGuide).toContain('목록이 비었으면 이 항목은 따지지 않는다')
  })

  it('says so in the en author guide', () => {
    expect(enGuide).toContain('Check only the `mustInclude` list in pending.json')
    expect(enGuide).toContain('If the list is empty, skip this item')
  })
})
