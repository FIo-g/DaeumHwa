import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBible } from './bible'
import { bibleExempt, chapterMetrics } from './metrics'
import { initRun, resummarizeRun } from './cli'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-review-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resummarize pre-rewrite metrics', () => {
  it('recomputes metrics/NN.pre-rewrite.json from chapters/NN.pre-rewrite.md with the same arguments', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    mkdirSync(join(dir, 'metrics'), { recursive: true })
    const bible = loadBible('ko')
    const rewritten = '세린은 문을 닫았다. 안개가 계단을 반쯤 삼키고 있었다.\n'
    const preRewrite = `${'가'.repeat(100)} 嬷嬷\n`
    writeFileSync(join(dir, 'chapters', '02.md'), rewritten)
    writeFileSync(join(dir, 'chapters', '02.pre-rewrite.md'), preRewrite)
    // The stale copy was written by the old metric code.
    writeFileSync(join(dir, 'metrics', '02.pre-rewrite.json'), '{"foreignRuns": []}\n')

    const result = resummarizeRun(dir)

    // The pre-rewrite copy is not a chapter of its own.
    expect(result.chapters).toBe(1)
    const expectedFor = (text: string) =>
      chapterMetrics(text, 'ko', bible.targetChars, [bible.workStyle.examples], bibleExempt(bible))
    const metrics = JSON.parse(readFileSync(join(dir, 'metrics', '02.json'), 'utf8'))
    const preMetrics = JSON.parse(readFileSync(join(dir, 'metrics', '02.pre-rewrite.json'), 'utf8'))
    expect(metrics).toEqual(expectedFor(rewritten))
    expect(preMetrics).toEqual(expectedFor(preRewrite))
    expect(preMetrics.foreignRuns).toEqual(['嬷嬷'])
  })

  it('writes no pre-rewrite metrics when the run has no pre-rewrite file', () => {
    const dir = join(tempDir(), 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    mkdirSync(join(dir, 'metrics'), { recursive: true })
    writeFileSync(join(dir, 'chapters', '02.md'), '세린은 문을 닫았다.\n')

    const result = resummarizeRun(dir)

    expect(result.chapters).toBe(1)
    expect(existsSync(join(dir, 'metrics', '02.json'))).toBe(true)
    expect(existsSync(join(dir, 'metrics', '02.pre-rewrite.json'))).toBe(false)
  })
})
