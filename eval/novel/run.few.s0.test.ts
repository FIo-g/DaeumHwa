import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { type Pending } from './author-io'
import { loadBible } from './bible'
import { firstSentence } from './instructions'
import { createRun, openRun, runUntilBlocked } from './run'

// Few-instruction runs give the author agent the first sentence only and no mustInclude list (stage 0).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Runs one chapter with the fake author and returns the draft_review pendings it saw. */
async function reviewsOf(
  fewInstructions: boolean,
): Promise<Extract<Pending, { kind: 'draft_review' }>[]> {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-few-s0-'))
  dirs.push(dir)
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...(fewInstructions ? { fewInstructions: true } : {}),
  })
  const ctx = await openRun(dir, { inner: new FakeAiClient(), autoAuthor: true })
  const seen: Pending[] = []
  const answer = ctx.autoAuthor
  ctx.autoAuthor = (p) => {
    seen.push(p)
    return answer?.(p) ?? { kind: 'draft_review', usable: true, quality: 4, reason: '' }
  }
  try {
    await runUntilBlocked(ctx)
  } finally {
    await ctx.close()
  }
  return seen.filter(
    (p): p is Extract<Pending, { kind: 'draft_review' }> => p.kind === 'draft_review',
  )
}

describe('few-instruction runs', () => {
  it('gives the draft review the first sentence and no mustInclude list', async () => {
    const reviews = await reviewsOf(true)
    const first = reviews[0]
    expect(first).toBeDefined()
    expect(first?.mustInclude).toEqual([])
    expect(first?.instructions).toBe(firstSentence(loadBible('ko').chapters[0]?.instructions ?? ''))
  })

  it('gives the draft review the bible list in a full run', async () => {
    const reviews = await reviewsOf(false)
    expect(reviews[0]?.mustInclude).toEqual(loadBible('ko').chapters[0]?.mustInclude)
  })
})
