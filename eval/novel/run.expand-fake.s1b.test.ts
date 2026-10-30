import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// Stage 1b fix F9: a default fake run (no overrides) reaches the expansion path and writes no
// continue.json, because the fake answers draft-expand.

const opened: Awaited<ReturnType<typeof openRun>>[] = []
const dirs: string[] = []

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('default fake run expands a short draft', () => {
  it('makes draft-expand calls without errors and writes no continue.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'novel-run-expand-fake-'))
    dirs.push(dir)
    createRun(dir, {
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 2,
      maxDraftAttempts: 2,
      commit: 'test',
    })
    const ctx = await openRun(dir, { inner: new FakeAiClient(), autoAuthor: true })
    opened.push(ctx)
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    await runUntilBlocked(ctx)

    const expands = readCallRecords(dir).filter((record) => record.task === 'draft-expand')
    expect(expands.length).toBeGreaterThan(0)
    expect(expands.filter((record) => record.error !== null)).toEqual([])
    expect(existsSync(join(dir, 'chapters', '01.attempt-1.continue.json'))).toBe(false)
    expect(readFileSync(join(dir, 'chapters', '01.attempt-1.draft.raw.txt'), 'utf8')).toContain(
      '(데모 확장)',
    )
  })
})
