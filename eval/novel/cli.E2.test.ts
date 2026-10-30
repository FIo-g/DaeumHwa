import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBible } from './bible'
import { chapterMetrics } from './metrics'
import { initRun, resummarizeRun } from './cli'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resummarize sampleCopyHits', () => {
  it('counts copies of the work style examples, as the draft step does', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-cli-e2-'))
    dirs.push(root)
    const dir = join(root, 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    mkdirSync(join(dir, 'metrics'), { recursive: true })
    const bible = loadBible('ko')
    const text = '세린은 문을 닫았다. 안개가 계단을 반쯤 삼키고 있었다.\n'
    writeFileSync(join(dir, 'chapters', '01.md'), text)

    resummarizeRun(dir)

    const metrics = JSON.parse(readFileSync(join(dir, 'metrics', '01.json'), 'utf8'))
    const expected = chapterMetrics(text, 'ko', bible.targetChars, [
      bible.workStyle.examples,
    ]).sampleCopyHits
    expect(expected).toBeGreaterThan(0)
    expect(metrics.sampleCopyHits).toBe(expected)
  })
})
