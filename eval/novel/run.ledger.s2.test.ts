import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { authorDirectives } from '@/db/schema'
import { FakeAiClient } from '@/test/fake-ai'
import { chapterInstructions } from './instructions'
import { DIRECTIVE_PROBES } from './directives'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked, type RunCreateOptions } from './run'
import { loadState } from './state'
import { readCallRecords } from './steps/util'
import { listEntries } from '@/server/wiki'

// Ledger mode (stage 2, task 8): the probes are planted as author requests once, before chapter 1's
// first plan or draft call, and no probe text goes into the chapter instructions.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newRun(o: Partial<RunCreateOptions> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-ledger-s2-'))
  dirs.push(dir)
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    directives: true,
    directivesMode: 'ledger',
    ...o,
  })
  return dir
}

describe('ledger planting', () => {
  it('plants four probe rows once, the tic row on the character when the entry exists', async () => {
    const dir = newRun()
    const ctx = await openRun(dir, { inner: new FakeAiClient(), autoAuthor: true })
    try {
      await runUntilBlocked(ctx)
      const workId = loadState(dir).data.workId as string
      const rows = await ctx.db
        .select()
        .from(authorDirectives)
        .where(and(eq(authorDirectives.workId, workId), eq(authorDirectives.source, 'author')))
      expect(rows).toHaveLength(4)

      // Advancing chapter 1 again must not add rows.
      await runUntilBlocked(ctx)
      const again = await ctx.db
        .select()
        .from(authorDirectives)
        .where(and(eq(authorDirectives.workId, workId), eq(authorDirectives.source, 'author')))
      expect(again).toHaveLength(4)

      const entries = await listEntries(ctx.db, ctx.actor, workId)
      const yunseo = entries.find(
        (entry) => entry.name === '도윤서' || entry.aliases.includes('도윤서'),
      )
      const tic = again.find((row) => row.text === DIRECTIVE_PROBES.ko[0]?.text)
      expect(tic?.kind).toBe('speech')
      expect(tic?.scope).toBe(yunseo ? 'character' : 'work')
      expect(tic?.entryId ?? null).toBe(yunseo ? yunseo.id : null)
      expect(again.find((row) => row.pattern === '고개를 끄덕')?.kind).toBe('ban')
      expect(again.find((row) => row.pattern === '입꼬리')?.kind).toBe('ban')
      expect(again.find((row) => row.text === DIRECTIVE_PROBES.ko[3]?.text)?.scope).toBe('work')
    } finally {
      await ctx.close()
    }
  }, 120_000)

  it('keeps probe text out of the chapter 1 instructions and the draft prompt', async () => {
    const dir = newRun()
    const ctx = await openRun(dir, { inner: new FakeAiClient(), autoAuthor: true })
    try {
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    const bible = loadBible('ko')
    const instructions = chapterInstructions(bible, 1, {
      lang: 'ko',
      directives: true,
      directivesMode: 'ledger',
    })
    expect(instructions).toBe(bible.chapters[0]?.instructions)
    const draft = readCallRecords(dir).find((call) => call.task === 'draft-chapter')
    expect(draft?.prompt).not.toContain(DIRECTIVE_PROBES.ko[3]?.text ?? '@@')
  }, 120_000)

  it('sends the author requests in the draft prefix of chapters 1 to 3', async () => {
    const dir = newRun({ chapters: 3 })
    const ctx = await openRun(dir, { inner: new FakeAiClient(), autoAuthor: true })
    try {
      await runUntilBlocked(ctx)
    } finally {
      await ctx.close()
    }
    const drafts = readCallRecords(dir).filter(
      (call) => call.task === 'draft-chapter' && call.kind === 'stream',
    )
    for (const step of ['ch1:draft', 'ch2:draft', 'ch3:draft']) {
      const draft = drafts.find((call) => call.step === step)
      expect(draft?.promptPrefix?.join('\n') ?? '').toContain('<author_requests>')
    }
  }, 300_000)
})
