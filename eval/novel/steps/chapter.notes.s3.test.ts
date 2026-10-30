import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { aiRuns } from '@/db/schema'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from '../fake-author'
import { loadBible } from '../bible'
import type { Answer, Pending } from '../author-io'
import { createRun, openRun, runUntilBlocked, type RunCreateOptions } from '../run'

// Stage 3 task 7: every revision note reaches the next plan prompt and the draft call.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newRun(o: Partial<RunCreateOptions> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-notes-s3-'))
  dirs.push(dir)
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    fewInstructions: true,
    ...o,
  })
  return dir
}

type PlanInput = {
  revision?: { card: unknown; note: string; earlierNotes?: string[] } | null
}

describe('eval plan revision notes (stage 3 task 7)', () => {
  it('the third revision call carries the first two notes, and the draft keeps all of them', async () => {
    const dir = newRun()
    const notes = ['열쇠를 목에 건다', '밤에 비가 온다', '세 번째 메모']
    const planInputs: PlanInput[] = []
    const inner = new FakeAiClient({
      overrides: {
        'draft-plan': (input) => {
          planInputs.push(input as PlanInput)
          return fakeDraftPlan()
        },
      },
    })
    const ctx = await openRun(dir, { inner, autoAuthor: true })
    let round = 0
    ctx.autoAuthor = (p): Answer => {
      if (p.kind !== 'plan_review') return fakeAnswer(p as Pending, loadBible('ko'))
      round += 1
      if (round <= notes.length) {
        return { kind: 'plan_review', approve: false, note: notes[round - 1]! }
      }
      return { kind: 'plan_review', approve: true }
    }
    try {
      const state = await runUntilBlocked(ctx)
      expect(state.status).toBe('done')
      // One initial plan plus one call per note.
      expect(planInputs).toHaveLength(notes.length + 1)
      // Second revision carries the first note; third revision carries the first two.
      expect(planInputs[2]?.revision?.earlierNotes).toEqual([notes[0]])
      expect(planInputs[3]?.revision?.earlierNotes).toEqual([notes[0], notes[1]])
      expect(state.data.plans?.[1]?.notes).toEqual(notes)
      // The draft run keeps every note.
      const rows = await ctx.db.select().from(aiRuns).where(eq(aiRuns.task, 'draft-chapter'))
      const kept = (rows[0]?.output ?? {}) as { planNotes?: string[] }
      expect(kept.planNotes).toEqual(notes)
    } finally {
      await ctx.close()
    }
  }, 120_000)
})
