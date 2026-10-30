import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkSecondReview,
  parseReviewVerdict,
  qMeanNearLine,
  reviewGate,
  runQMean,
} from './review-verdict'

// Track M3 part a: the verdict block a reviewer ends review.md with, and the gate that reads it.

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'novel-verdict-m3-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fence(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  return `\`\`\`json\n${text}\n\`\`\``
}

/** Some prose, then one fenced json block of `obj`, then optional extra text. */
function review(obj: unknown, extra = ''): string {
  return `# Review\n\nSome prose about the chapter.\n\n${fence(obj)}\n${extra}`
}

function chapter(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chapter: 1,
    thresholdsFailed: [],
    qScores: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    verdict: 'publishable',
    ...over,
  }
}

function doc(chapters: unknown[]): Record<string, unknown> {
  return { schema: 'review-verdict-1', chapters }
}

describe('parseReviewVerdict', () => {
  it('parses the last verdict block and ignores other json fences', () => {
    const text = `${fence({ a: 1 })}\n\n${review(doc([chapter()]))}`
    const parsed = parseReviewVerdict(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.verdict.chapters).toHaveLength(1)
  })

  it('returns no-verdict-block when no fence carries the schema id', () => {
    const plain = parseReviewVerdict('# Review\n\nOnly prose here.')
    expect(plain).toMatchObject({ ok: false, code: 'no-verdict-block' })
    const other = parseReviewVerdict(`# Review\n\n${fence({ a: 1 })}`)
    expect(other).toMatchObject({ ok: false, code: 'no-verdict-block' })
  })

  it('returns invalid-verdict-block for broken json', () => {
    const broken = '{"schema":"review-verdict-1","chapters":[],}'
    const parsed = parseReviewVerdict(review(broken))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.code).toBe('invalid-verdict-block')
      expect(parsed.detail.length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['8 Q scores', doc([chapter({ qScores: [4, 4, 4, 4, 4, 4, 4, 4] })])],
    ['a Q score of 6', doc([chapter({ qScores: [4, 4, 4, 4, 4, 4, 4, 4, 6] })])],
    ['threshold id T8', doc([chapter({ thresholdsFailed: ['T8'] })])],
    ['empty chapters', doc([])],
    ['two chapters with the same number', doc([chapter(), chapter()])],
    ['verdict with a space', doc([chapter({ verdict: 'not publishable' })])],
  ])('rejects a wrong shape: %s', (_name, obj) => {
    const parsed = parseReviewVerdict(review(obj))
    expect(parsed).toMatchObject({ ok: false, code: 'invalid-verdict-block' })
    if (!parsed.ok) expect(parsed.detail.length).toBeGreaterThan(0)
  })

  it('the last block wins', () => {
    const first = doc([chapter({ thresholdsFailed: ['T2'] })])
    const second = doc([chapter({ thresholdsFailed: ['T3', 'T4'] })])
    const parsed = parseReviewVerdict(`${review(first)}\n${fence(second)}`)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.verdict.chapters[0]?.thresholdsFailed).toEqual(['T3', 'T4'])
  })

  it('an invalid last block wins over an earlier valid one', () => {
    const valid = doc([chapter()])
    const invalid = doc([chapter({ qScores: [4, 4] })])
    const parsed = parseReviewVerdict(`${review(valid)}\n${fence(invalid)}`)
    expect(parsed).toMatchObject({ ok: false, code: 'invalid-verdict-block' })
  })
})

describe('runQMean and qMeanNearLine', () => {
  it('runQMean is the mean of chapter means, rounded to two decimals', () => {
    const one = parseReviewVerdict(review(doc([chapter({ qScores: [4, 3, 4, 3, 3, 4, 4, 4, 4] })])))
    if (one.ok) expect(runQMean(one.verdict)).toBe(3.67)
    else throw new Error('fixture must parse')
    const two = doc([
      chapter({ chapter: 1, qScores: [3, 3, 3, 3, 3, 3, 3, 3, 3] }),
      chapter({ chapter: 2, qScores: [4, 4, 4, 4, 4, 4, 4, 4, 4] }),
    ])
    const twoParsed = parseReviewVerdict(review(two))
    if (twoParsed.ok) expect(runQMean(twoParsed.verdict)).toBe(3.5)
    else throw new Error('fixture must parse')
  })

  it('qMeanNearLine is inclusive at both ends', () => {
    expect(qMeanNearLine(3.65)).toBe(true)
    expect(qMeanNearLine(3.75)).toBe(true)
    expect(qMeanNearLine(3.85)).toBe(true)
    expect(qMeanNearLine(3.64)).toBe(false)
    expect(qMeanNearLine(3.86)).toBe(false)
  })
})

describe('checkSecondReview', () => {
  // Fixtures from the six saved 2026-10-18 reviews (brief Evidence table).
  const SAVED = [
    {
      name: 'qwen ko',
      failed: ['T2', 'T5'],
      q: [3, 2, 3, 3, 3, 3, 2, 3, 4],
      needed: false,
      reasons: [],
    },
    {
      name: 'qwen en',
      failed: ['T2'],
      q: [3, 2, 3, 3, 4, 3, 3, 3, 3],
      needed: true,
      reasons: ['single-threshold-failure'],
    },
    {
      name: 'haiku ko',
      failed: ['T2', 'T3'],
      q: [4, 3, 4, 3, 3, 4, 4, 4, 4],
      needed: true,
      reasons: ['q-mean-near-line'],
    },
    {
      name: 'haiku en',
      failed: ['T2', 'T3'],
      q: [4, 3, 4, 4, 4, 3, 4, 4, 4],
      needed: true,
      reasons: ['q-mean-near-line'],
    },
    {
      name: 'luna ko',
      failed: ['T2', 'T3'],
      q: [3, 3, 4, 3, 3, 3, 4, 3, 4],
      needed: false,
      reasons: [],
    },
    {
      name: 'luna en',
      failed: [],
      q: [4, 4, 4, 3, 4, 3, 4, 3, 4],
      needed: true,
      reasons: ['q-mean-near-line'],
    },
  ] as const

  it.each(SAVED)('matches the saved run $name', (run) => {
    const parsed = parseReviewVerdict(
      review(doc([chapter({ thresholdsFailed: [...run.failed], qScores: [...run.q] })])),
    )
    const check = checkSecondReview(parsed)
    expect(check.needed).toBe(run.needed)
    expect(check.reasons).toEqual(run.reasons)
  })

  it('gives both reasons when both hold', () => {
    const parsed = parseReviewVerdict(
      review(doc([chapter({ thresholdsFailed: ['T2'], qScores: [4, 3, 4, 3, 3, 4, 4, 4, 4] })])),
    )
    const check = checkSecondReview(parsed)
    expect(check.reasons).toContain('single-threshold-failure')
    expect(check.reasons).toContain('q-mean-near-line')
  })

  it('does not ask for a second review far from the line', () => {
    const parsed = parseReviewVerdict(
      review(doc([chapter({ qScores: [4, 4, 4, 4, 4, 4, 4, 4, 5], verdict: 'excellent' })])),
    )
    const check = checkSecondReview(parsed)
    expect(check.needed).toBe(false)
    expect(check.reasons).toEqual([])
  })

  it('sums failed thresholds over chapters', () => {
    const parsed = parseReviewVerdict(
      review(
        doc([
          chapter({ chapter: 1, thresholdsFailed: ['T2'], qScores: [1, 1, 1, 1, 1, 1, 1, 1, 1] }),
          chapter({ chapter: 2, thresholdsFailed: ['T5'], qScores: [1, 1, 1, 1, 1, 1, 1, 1, 1] }),
        ]),
      ),
    )
    const check = checkSecondReview(parsed)
    expect(check.tFailCount).toBe(2)
    expect(check.reasons).not.toContain('single-threshold-failure')
  })

  it('counts a repeated threshold id once per chapter', () => {
    const parsed = parseReviewVerdict(
      review(
        doc([chapter({ thresholdsFailed: ['T2', 'T2'], qScores: [1, 1, 1, 1, 1, 1, 1, 1, 1] })]),
      ),
    )
    const check = checkSecondReview(parsed)
    expect(check.tFailCount).toBe(1)
    expect(check.reasons).toEqual(['single-threshold-failure'])
  })

  it('a missing block means a second review is needed', () => {
    const check = checkSecondReview(parseReviewVerdict('# Review\n\nprose only'))
    expect(check.needed).toBe(true)
    expect(check.reasons).toEqual(['no-verdict-block'])
    expect(check.qMean).toBeNull()
    expect(check.tFailCount).toBeNull()
  })

  it('an invalid block means a second review is needed', () => {
    const check = checkSecondReview(parseReviewVerdict(review(doc([]))))
    expect(check.needed).toBe(true)
    expect(check.reasons).toEqual(['invalid-verdict-block'])
    expect(check.qMean).toBeNull()
    expect(check.tFailCount).toBeNull()
  })
})

describe('reviewGate', () => {
  function runWith(text: string | null, extraReview2 = false): string {
    const dir = path.join(tempDir(), 'run-01-ko')
    mkdirSync(dir, { recursive: true })
    if (text !== null) writeFileSync(path.join(dir, 'review.md'), text)
    if (extraReview2) writeFileSync(path.join(dir, 'review-2.md'), '# second')
    return dir
  }

  const NEAR = review(doc([chapter({ qScores: [4, 3, 4, 3, 3, 4, 4, 4, 4] })]))
  const FAR = review(doc([chapter({ qScores: [4, 4, 4, 4, 4, 4, 4, 4, 5], verdict: 'excellent' })]))

  it('reports needed from review.md', () => {
    const result = reviewGate(runWith(NEAR))
    expect(result.decision).toBe('needed')
    expect(result.parse).toBe('ok')
    expect(result.reasons).toEqual(['q-mean-near-line'])
  })

  it('reports already-done when review-2.md exists, even when the run is near the line', () => {
    const result = reviewGate(runWith(NEAR, true))
    expect(result.decision).toBe('already-done')
    expect(result.needed).toBe(true)
  })

  it('reports not-needed far from the line', () => {
    const result = reviewGate(runWith(FAR))
    expect(result.decision).toBe('not-needed')
    expect(result.needed).toBe(false)
  })

  it('throws when review.md is missing', () => {
    expect(() => reviewGate(runWith(null))).toThrow(/review\.md missing/)
  })

  it('a review without a block is needed, parse is no-verdict-block', () => {
    const result = reviewGate(runWith('# Review\n\nprose only'))
    expect(result.decision).toBe('needed')
    expect(result.parse).toBe('no-verdict-block')
    expect(result.qMean).toBeNull()
  })
})
