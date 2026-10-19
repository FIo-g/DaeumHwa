import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishReview, secondBlindDir, writeBlindCopy } from './blind'

// Track M3 part a: the second reviewer's blind copy sits beside blind/ and never shares it.

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'novel-blind-m3-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const CONFIG = {
  runId: 'run-01',
  modelId: 'haiku-5.5',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 3,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'abc1234',
}

function put(root: string, rel: string, content: string): void {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** A run dir with config.json and one chapter, the smallest that writeBlindCopy accepts. */
function makeRun(lang: 'ko' | 'en' = 'ko'): string {
  const runDir = path.join(tempDir(), '2026-10-19', `run-01-${lang}`)
  put(runDir, 'config.json', JSON.stringify({ ...CONFIG, lang }))
  put(runDir, 'chapters/01.md', '# 1화\n\n본문')
  return runDir
}

describe('secondBlindDir', () => {
  it('sits next to blind under blind-2', () => {
    const run = path.join('eval', 'results', 'novel', '2026-10-19', 'run-01-ko')
    expect(secondBlindDir(run)).toBe(
      path.join('eval', 'results', 'novel', '2026-10-19', 'blind-2', 'run-01-ko'),
    )
  })
})

describe('publishReview with second', () => {
  it('reads blind-2 and writes review-2.md, not review.md', () => {
    const runDir = makeRun('ko')
    const docs = path.join(tempDir(), 'docs', 'haiku-5.5-ko.md')
    put(secondBlindDir(runDir), 'review.md', '# Review\nbody')
    const result = publishReview(runDir, docs, { second: true })
    expect(result.runReviewPath).toBe(path.join(runDir, 'review-2.md'))
    const text = readFileSync(docs, 'utf8')
    expect(text).toMatch(/^모델: haiku-5\.5 \| 언어: ko \| 검토: 2\n\n# Review\nbody$/)
    expect(readFileSync(path.join(runDir, 'review-2.md'), 'utf8')).toBe(text)
    expect(existsSync(path.join(runDir, 'review.md'))).toBe(false)
  })

  it('writes the English header for an en run', () => {
    const runDir = makeRun('en')
    const docs = path.join(tempDir(), 'docs', 'haiku-5.5-en.md')
    put(secondBlindDir(runDir), 'review.md', 'body')
    publishReview(runDir, docs, { second: true })
    expect(readFileSync(docs, 'utf8')).toMatch(
      /^Model: haiku-5\.5 \| Language: en \| Review: 2\n\n/,
    )
  })

  it('throws when the blind-2 review is missing, even if the first blind review exists', () => {
    const runDir = makeRun('ko')
    put(path.join(path.dirname(runDir), 'blind', path.basename(runDir)), 'review.md', 'first')
    expect(() => publishReview(runDir, path.join(tempDir(), 'a.md'), { second: true })).toThrow(
      'review.md missing',
    )
  })

  it('the first publishReview output is unchanged', () => {
    const runDir = makeRun('ko')
    const docs = path.join(tempDir(), 'docs', 'haiku-5.5-ko.md')
    put(
      path.join(path.dirname(runDir), 'blind', path.basename(runDir)),
      'review.md',
      '# Review\nbody',
    )
    publishReview(runDir, docs)
    expect(readFileSync(docs, 'utf8')).toBe('모델: haiku-5.5 | 언어: ko\n\n# Review\nbody')
    expect(readFileSync(path.join(runDir, 'review.md'), 'utf8')).toBe(
      '모델: haiku-5.5 | 언어: ko\n\n# Review\nbody',
    )
  })
})

describe('second blind copy', () => {
  it('building the second copy leaves the first copy and its review alone', () => {
    const runDir = makeRun('ko')
    const repoRoot = process.cwd()
    writeBlindCopy(runDir, { repoRoot })
    const firstReview = path.join(path.dirname(runDir), 'blind', path.basename(runDir), 'review.md')
    put(path.dirname(firstReview), 'review.md', 'first review')

    const second = writeBlindCopy(runDir, { repoRoot, out: secondBlindDir(runDir) })
    expect(second.dir).toBe(secondBlindDir(runDir))
    expect(readFileSync(firstReview, 'utf8')).toBe('first review')
    expect(existsSync(path.join(second.dir, 'review.md'))).toBe(false)
  })
})
