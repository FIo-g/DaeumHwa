import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Stage 0 task 5: the reviewer counts the places an author must fix, and the criteria define them.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const reviewerMd = read('./agents/reviewer.md')
const criteriaMd = read('../../docs/eval/novel-quality-criteria.md')

describe('reviewer.md must-fix list', () => {
  it('names the must-fix heading in both languages and the verdict key', () => {
    expect(reviewerMd).toContain('작가가 반드시 고칠 곳')
    expect(reviewerMd).toContain('Places the author must fix')
    expect(reviewerMd).toContain('"mustFix"')
  })
})

describe('criteria file must-fix definition', () => {
  it('defines the must-fix places in section 3.6', () => {
    expect(criteriaMd).toContain('3.6')
    expect(criteriaMd).toContain('작가가 반드시 고칠 곳')
  })
})
