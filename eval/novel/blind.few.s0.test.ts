import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBible } from './bible'
import { findLeaks, writeBlindCopy } from './blind'
import { createRun } from './run'

// Stage 0 fix F10: a few-instruction run's blind copy carries the bible's chapter events, so the reviewer can judge T1.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fakeRun(fewInstructions: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'novel-blind-few-s0-'))
  dirs.push(root)
  const run = join(root, 'run-01-ko')
  createRun(run, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...(fewInstructions ? { fewInstructions: true } : {}),
  })
  return run
}

describe('blind copy of a few-instruction run', () => {
  it('writes the bible chapter events for the reviewer', () => {
    const run = fakeRun(true)
    const out = join(run, '..', 'blind', 'run-01-ko')
    writeBlindCopy(run, { out, repoRoot: process.cwd() })
    const file = join(out, 'reference', 'chapter-events.json')
    expect(existsSync(file)).toBe(true)
    const events = JSON.parse(readFileSync(file, 'utf8')) as {
      chapters: { n: number; instructions: string; mustInclude: string[] }[]
    }
    expect(events.chapters[0]?.n).toBe(1)
    expect(events.chapters[0]?.mustInclude).toEqual(loadBible('ko').chapters[0]?.mustInclude)
    expect(findLeaks(out)).toEqual([])
  })

  it('writes no chapter events for a full run', () => {
    const run = fakeRun(false)
    const out = join(run, '..', 'blind', 'run-01-ko')
    writeBlindCopy(run, { out, repoRoot: process.cwd() })
    expect(existsSync(join(out, 'reference', 'chapter-events.json'))).toBe(false)
  })
})
