import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { aiRuns } from '@/db/schema'
import type { ContinuityInput } from '@/ai/tasks/continuity-check'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import type { Answer, Pending } from './author-io'
import { createRun, openRun, runUntilBlocked, type RunCreateOptions } from './run'
import { readCallRecords } from './steps/util'

// The plan card flow of the draft step (stage 1): a plan before the draft, and the few-instruction
// plan review with its notes.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newRun(o: Partial<RunCreateOptions> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-plan-s1-'))
  dirs.push(dir)
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...o,
  })
  return dir
}

/** The draft_plan inputs the fake client saw, in order. */
type PlanInput = { revision: { card: unknown; note: string } | null }

/**
 * Runs chapter 1 with the fake author. `answerPlan` answers each plan_review pending; the fake
 * author answers everything else. Returns the plan review pendings the author saw and the inputs of
 * the plan calls.
 */
async function runChapter(
  dir: string,
  answerPlan: (p: Extract<Pending, { kind: 'plan_review' }>) => Answer,
) {
  const planInputs: PlanInput[] = []
  const checks: ContinuityInput[] = []
  const inner = new FakeAiClient({
    overrides: {
      'draft-plan': (input) => {
        planInputs.push(input as PlanInput)
        return fakeDraftPlan()
      },
      'continuity-check': (input) => {
        checks.push(input as ContinuityInput)
        return { issues: [] }
      },
    },
  })
  const ctx = await openRun(dir, { inner, autoAuthor: true })
  const reviews: Extract<Pending, { kind: 'plan_review' }>[] = []
  ctx.autoAuthor = (p) => {
    if (p.kind !== 'plan_review') return fakeAnswer(p, loadBible('ko'))
    reviews.push(p)
    return answerPlan(p)
  }
  try {
    const state = await runUntilBlocked(ctx)
    return { ctx, state, reviews, planInputs, checks }
  } finally {
    await ctx.close()
  }
}

describe('plan card flow (comparison run)', () => {
  it('makes one draft-plan call before the draft stream, and stores the plan with the draft', async () => {
    const dir = newRun()
    const inner = new FakeAiClient({
      overrides: { 'draft-plan': () => fakeDraftPlan() },
    })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    try {
      await runUntilBlocked(ctx)
      const records = readCallRecords(dir)
      const plans = records.filter((record) => record.task === 'draft-plan')
      const stream = records.find((record) => record.task === 'draft-chapter')
      expect(plans).toHaveLength(1)
      expect(plans[0]?.step).toBe('ch1:draft')
      expect(stream).toBeDefined()
      expect((plans[0]?.seq ?? Infinity) < (stream?.seq ?? 0)).toBe(true)

      const rows = await ctx.db.select().from(aiRuns).where(eq(aiRuns.task, 'draft-chapter'))
      expect(rows.some((row) => 'plan' in ((row.output ?? {}) as object))).toBe(true)
    } finally {
      await ctx.close()
    }
  }, 120_000)
})

describe('plan card flow (few-instruction run)', () => {
  it('posts a plan_review with the full bible text and re-plans with the author note', async () => {
    const note = '종이 혼자 떠는 장면을 넣어 주세요'
    const dir = newRun({ fewInstructions: true })
    let round = 0
    const { reviews, planInputs } = await runChapter(dir, () => {
      round += 1
      return round === 1
        ? { kind: 'plan_review', approve: false, note }
        : { kind: 'plan_review', approve: true }
    })
    const bible = loadBible('ko')
    expect(reviews[0]).toMatchObject({
      kind: 'plan_review',
      chapter: 1,
      intention: bible.chapters[0]?.instructions,
    })
    expect(planInputs).toHaveLength(2)
    expect(planInputs[1]?.revision?.note).toBe(note)
  }, 120_000)

  it('starts the draft after three notes, using the last card', async () => {
    const dir = newRun({ fewInstructions: true })
    const { reviews, planInputs, ctx } = await runChapter(dir, () => ({
      kind: 'plan_review',
      approve: false,
      note: '인물의 결정을 앞으로 당겨 주세요',
    }))
    expect(reviews).toHaveLength(3)
    // One plan call, then one per note.
    expect(planInputs).toHaveLength(4)
    const records = readCallRecords(dir)
    expect(records.some((record) => record.task === 'draft-chapter')).toBe(true)
    expect(ctx.dir).toBe(dir)
  }, 120_000)
})

describe('plan card flow (quick run)', () => {
  it('makes no draft-plan call', async () => {
    const dir = newRun({ quick: true })
    const { planInputs } = await runChapter(dir, () => ({ kind: 'plan_review', approve: true }))
    expect(planInputs).toHaveLength(0)
    expect(readCallRecords(dir).some((record) => record.task === 'draft-plan')).toBe(false)
  }, 120_000)
})

describe('plan card in the continuity check (stage 1)', () => {
  it('a default plan run sends the card scenes as the scene plan', async () => {
    const dir = newRun()
    const { checks } = await runChapter(dir, () => ({ kind: 'plan_review', approve: true }))
    expect(checks.length).toBeGreaterThan(0)
    expect(checks[0]?.scenePlan?.startsWith('장면 1\n장소: 도서관')).toBe(true)
  }, 120_000)

  it('a quick cloud run sends no scene plan', async () => {
    const dir = newRun({ quick: true, modelId: 'haiku-5.5' })
    const { checks } = await runChapter(dir, () => ({ kind: 'plan_review', approve: true }))
    expect(checks.length).toBeGreaterThan(0)
    expect(checks[0]).not.toHaveProperty('scenePlan')
  }, 120_000)
})

describe('plan card and two-step draft (stage 1)', () => {
  it('a plan run on a two-step profile makes no draft-beats call', async () => {
    const dir = newRun({ modelId: 'qwen3.8-27b' })
    const { planInputs, state } = await runChapter(dir, () => ({
      kind: 'plan_review',
      approve: true,
    }))
    expect(state.status).toBe('done')
    expect(planInputs).toHaveLength(1)
    expect(readCallRecords(dir).some((record) => record.task === 'draft-beats')).toBe(false)
    expect(readCallRecords(dir).some((record) => record.task === 'draft-chapter')).toBe(true)
  }, 120_000)
})

describe('plan review resume (stage 1)', () => {
  it('re-plans again on resume when the re-plan pauses, and counts the note once', async () => {
    const dir = newRun({ fewInstructions: true })
    const note = '종이 혼자 떠는 장면을 넣어 주세요'
    const external = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 })

    // First run: the first plan call succeeds, the re-plan hits the limit.
    let firstCalls = 0
    const failing = new FakeAiClient({
      overrides: {
        'draft-plan': () => {
          firstCalls += 1
          if (firstCalls === 2) throw external()
          return fakeDraftPlan()
        },
      },
    })
    const ctx1 = await openRun(dir, { inner: failing, autoAuthor: true })
    ctx1.autoAuthor = (p) =>
      p.kind === 'plan_review'
        ? { kind: 'plan_review', approve: false, note }
        : fakeAnswer(p, loadBible('ko'))
    try {
      const paused = await runUntilBlocked(ctx1)
      expect(paused.status).toBe('paused-limit')
    } finally {
      await ctx1.close()
    }

    // Resumed run: the stored note is re-planned, then the author approves the new card.
    const revisions: PlanInput[] = []
    const resumed = new FakeAiClient({
      overrides: {
        'draft-plan': (input) => {
          revisions.push(input as PlanInput)
          const card = fakeDraftPlan()
          card.scenes[0] = { ...card.scenes[0]!, place: '정원' }
          return card
        },
      },
    })
    const ctx2 = await openRun(dir, { inner: resumed, autoAuthor: true })
    ctx2.autoAuthor = (p) =>
      p.kind === 'plan_review'
        ? { kind: 'plan_review', approve: true }
        : fakeAnswer(p, loadBible('ko'))
    try {
      const state = await runUntilBlocked(ctx2)
      expect(state.status).toBe('done')
      expect(revisions).toHaveLength(1)
      expect(revisions[0]?.revision?.note).toBe(note)
      const entry = state.data.plans?.[1]
      expect(entry?.notes).toEqual([note])
      expect(entry?.card.scenes[0]?.place).toBe('정원')
    } finally {
      await ctx2.close()
    }
  }, 120_000)
})
