import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseReviewVerdict, reviewGate } from './review-verdict'

// Stage 0 task 5: the count of places an author must fix, per chapter, in the verdict block.

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'novel-verdict-s0-'))
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

function review(obj: unknown): string {
  return `# Review\n\nSome prose about the chapter.\n\n${fence(obj)}\n`
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

describe('parseReviewVerdict mustFix', () => {
  it('parses a chapter with mustFix 4 and keeps the count', () => {
    const parsed = parseReviewVerdict(review(doc([chapter({ mustFix: 4 })])))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.verdict.chapters[0]?.mustFix).toBe(4)
  })

  it('parses a chapter without mustFix (old reviews) and leaves it undefined', () => {
    const parsed = parseReviewVerdict(review(doc([chapter()])))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.verdict.chapters[0]?.mustFix).toBeUndefined()
  })

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('rejects %s', (_name, value) => {
    const parsed = parseReviewVerdict(review(doc([chapter({ mustFix: value })])))
    expect(parsed).toMatchObject({ ok: false, code: 'invalid-verdict-block' })
  })
})

describe('reviewGate mustFix', () => {
  function runWith(text: string): string {
    const dir = path.join(tempDir(), 'run-01-ko')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'review.md'), text)
    return dir
  }

  it('returns the mustFix count of a single chapter', () => {
    const gate = reviewGate(runWith(review(doc([chapter({ mustFix: 4 })]))))
    expect(gate.mustFix).toBe(4)
  })

  it('sums mustFix over chapters', () => {
    const gate = reviewGate(
      runWith(
        review(doc([chapter({ chapter: 1, mustFix: 2 }), chapter({ chapter: 2, mustFix: 3 })])),
      ),
    )
    expect(gate.mustFix).toBe(5)
  })

  it('returns null when any chapter lacks mustFix', () => {
    const gate = reviewGate(
      runWith(review(doc([chapter({ chapter: 1, mustFix: 2 }), chapter({ chapter: 2 })]))),
    )
    expect(gate.mustFix).toBeNull()
  })

  it('returns null when there is no verdict block', () => {
    const gate = reviewGate(runWith('# Review\n\nprose only'))
    expect(gate.parse).toBe('no-verdict-block')
    expect(gate.mustFix).toBeNull()
  })
})
