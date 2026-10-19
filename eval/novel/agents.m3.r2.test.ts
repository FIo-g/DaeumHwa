import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReviewVerdict } from './review-verdict'

// Guards on the agent prompts and the criteria, README text that the harness depends on (track M3).
// They read the files as text: the reviewer must end with a block the gate can parse, the reviewer
// must not name a model, and the T2 scope wording must stay in every place that states it.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const reviewerMd = read('./agents/reviewer.md')
const summaryMd = read('./agents/summary.md')
const criteriaMd = read('../../docs/eval/novel-quality-criteria.md')
const readmeMd = read('../../docs/eval/novel/README.md')

describe('reviewer.md', () => {
  it('carries an example verdict block the gate can parse', () => {
    expect(parseReviewVerdict(reviewerMd).ok).toBe(true)
    expect(reviewerMd).toContain('Never open any other review')
    expect(reviewerMd).toContain('Characterization (voice)')
  })

  it('does not name a model', () => {
    expect(reviewerMd).not.toMatch(/haiku|luna|sonnet|opus|qwen|exaone|gpt-oss/i)
  })

  it('puts the verdict data under a real heading and does not call the blinding note the last section', () => {
    expect(reviewerMd).toMatch(/^### Verdict data$/m)
    expect(reviewerMd).not.toContain('last section')
    expect(reviewerMd).toContain('before the verdict data')
  })
})

describe('criteria file', () => {
  it('fixes the T2 scope', () => {
    expect(criteriaMd).toContain('### 3.5 집계 범위')
    expect(criteriaMd).toContain('Narrative & Style 제외')
    expect(criteriaMd).toContain('문체 카드의 글쓰기 규칙(`rules`)은 Q6~Q8에서 본다')
    const t2Row = criteriaMd.split('\n').find((line) => line.startsWith('| T2 |')) ?? ''
    expect(t2Row).not.toContain('ConStory 5분류')
  })

  it('names no model in section 3.5', () => {
    const start = criteriaMd.indexOf('### 3.5')
    const end = criteriaMd.indexOf('## 4.', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = criteriaMd.slice(start, end)
    expect(section).not.toMatch(/haiku|luna|sonnet|opus|qwen|exaone|gpt-oss/i)
  })
})

describe('summary.md', () => {
  it('covers second reviews', () => {
    expect(summaryMd).toContain('second/')
    expect(summaryMd).toContain('판정 불일치')
    expect(summaryMd).toContain('Characterization (voice)')
  })
})

describe('README', () => {
  it('fixes the rules', () => {
    expect(readmeMd).toContain('## 6. 검토 규칙')
    expect(readmeMd).toContain('### 6.3 반복 실행 규칙')
    expect(readmeMd).toContain('r2brep2')
    expect(readmeMd).toContain('secondReview: false')
  })

  it('says the second review is made only when review-2.md is missing', () => {
    expect(readmeMd).toContain(
      '두 번째 검토는 `review-2.md`가 없을 때만 만든다. `rereview: true`는 첫 검토만 다시 쓴다.',
    )
  })
})
