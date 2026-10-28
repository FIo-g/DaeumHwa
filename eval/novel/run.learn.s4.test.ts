import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { authorDirectives } from '@/db/schema'
import { FakeAiClient } from '@/test/fake-ai'
import { loadBible, type Bible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { loadConfig, loadState, newState } from './state'
import { readCallRecords } from './steps/util'
import { buildRunSummary, readSummaryInputs } from './steps/finish'
import { readPending } from './author-io'
import { fakeAnswer } from './fake-author'
import { initRun } from './cli'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-learn-s4-'))
  dirs.push(dir)
  return dir
}

const KO_DRAFT = [
  '안개가 짙게 깔렸다. 세린은 고개를 끄덕였다.',
  '도윤서가 말했다. "먼저 들어가거라."',
  '입꼬리가 살짝 올라갔다.',
  '밤은 깊었고 종소리는 들리지 않았다. 바람은 차갑게 불었다.',
  '밤은 깊었고 종소리는 들리지 않았다.',
].join('\n\n')

describe('learn mode config', () => {
  it('stores learn mode and bank flag', () => {
    const dir = join(root(), 'learn-run')
    initRun({
      model: 'fake',
      lang: 'ko',
      chapters: 2,
      dir,
      directives: true,
      directivesMode: 'learn',
      exampleBank: true,
    } as never)
    const config = loadConfig(dir)
    expect(config.directivesMode).toBe('learn')
    expect((config as { exampleBank?: boolean }).exampleBank).toBe(true)
  })

  it('names the default run directory with -learn and -bank', () => {
    const text = readFileSync(new URL('./cli.ts', import.meta.url), 'utf8')
    expect(text).toContain('-learn')
    expect(text).toContain('-bank')
  })
})

// True when the passage names at least one bible character, by canonical name or alias. A bank
// passage that only invents people returns false, so the check in the bank test can fail.
function namesBibleCharacter(passage: string, bible: Bible): boolean {
  return bible.characters.some((character) =>
    [character.name, ...character.aliases].some((name) => passage.includes(name)),
  )
}

describe('example bank', () => {
  it('has 10 passages per language and each names a bible character', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const raw = readFileSync(
        new URL(`../fixtures/novel/${lang}/example-bank.json`, import.meta.url),
        'utf8',
      )
      const bank = JSON.parse(raw) as { passages?: string[] } & unknown
      const passages = (bank as { passages: string[] }).passages ?? (bank as unknown as string[])
      const list = Array.isArray(passages) ? passages : []
      expect(list).toHaveLength(10)
      const bible = loadBible(lang)
      for (const [index, passage] of list.entries()) {
        // 2-4 paragraphs.
        const paras = passage
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean)
        expect(paras.length).toBeGreaterThanOrEqual(2)
        expect(paras.length).toBeLessThanOrEqual(4)
        // At least one dialogue line.
        expect(passage).toMatch(/["“「『]/)
        // At least one bible character is named, by name or alias.
        expect(namesBibleCharacter(passage, bible), `passage ${index} (${lang})`).toBe(true)
      }
      // The plan's character × feeling pairs include these three, so the bank as a whole names them.
      const planCharacters = {
        ko: ['한세린', '도윤서', '한서연'],
        en: ['Han Serin', 'Do Yunseo', 'Han Seoyeon'],
      }[lang]
      const bankText = list.join('\n')
      for (const name of planCharacters) {
        const character = bible.characters.find((c) => c.name === name)
        const found =
          character !== undefined &&
          [character.name, ...character.aliases].some((alias) => bankText.includes(alias))
        expect(found, `${name} (${lang})`).toBe(true)
      }
      // No chapter-instruction event is told: bank must not contain the tower-top first-visit summary.
      expect(raw).not.toContain('9층 꼭대기에 처음')
      expect(raw).not.toContain('climbs all the way to the top')
    }
  })

  it('does not count a passage that only invents characters', () => {
    expect(namesBibleCharacter('김철수가 종루에 올랐다. "여기 있었어?"', loadBible('ko'))).toBe(
      false,
    )
    expect(
      namesBibleCharacter('Kim Cheolsu climbed the bell tower. "Were you here?"', loadBible('en')),
    ).toBe(false)
  })

  it('--example-bank on seeds the style card with the 10 passages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'novel-bank-seed-s4-'))
    dirs.push(dir)
    createRun(dir, {
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 1,
      maxDraftAttempts: 1,
      commit: 'test',
      exampleBank: true as never,
    } as never)
    const inner = new FakeAiClient()
    const ctx = await openRun(dir, { inner })
    try {
      const { setup } = await import('./steps/setup')
      const state = loadState(dir)
      await setup(ctx, 'setup', state)
      const { listStyleCards } = await import('@/server/styles')
      const cards = await listStyleCards(ctx.db, ctx.actor, state.data.workId as string)
      const examples = cards[0]?.examples ?? ''
      expect(examples).toContain('안개')
      // Seeded with bank: at least 10 dialogue marks from the bank.
      expect((examples.match(/["“]/g) ?? []).length).toBeGreaterThanOrEqual(10)
    } finally {
      await ctx.close()
    }
  }, 60_000)
})

describe('learn run', () => {
  it('records infer, pends proposals, adds a row used by ch2 prefix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'novel-learn-flow-s4-'))
    dirs.push(dir)
    createRun(dir, {
      modelId: 'fake',
      lang: 'ko',
      chapters: 2,
      questions: 1,
      maxDraftAttempts: 1,
      commit: 'test',
      directives: true,
      directivesMode: 'learn' as never,
    } as never)
    const inner = new FakeAiClient({
      overrides: {
        'draft-chapter': () => KO_DRAFT,
        'directive-infer': () => ({
          proposals: [
            {
              text: "'입꼬리'는 쓰지 않는다",
              kind: 'ban',
              entryName: null,
              pattern: '입꼬리',
              evidence: [1],
            },
          ],
        }),
      } as never,
    })
    const ctx = await openRun(dir, { inner })
    // Custom author: learn proposals answered with add, everything else faked.
    const bible = loadBible('ko')
    ctx.autoAuthor = (p) => {
      if ((p as { kind: string }).kind === 'directive_proposals') {
        return { kind: 'directive_proposals', add: [0] } as never
      }
      return fakeAnswer(p as never, bible) as never
    }
    try {
      await runUntilBlocked(ctx)
      const workId = loadState(dir).data.workId as string
      // One directive-infer call with hunks-only prompt.
      const calls = readCallRecords(dir).filter((c) => c.task === 'directive-infer')
      expect(calls.length).toBeGreaterThanOrEqual(1)
      const recorded = inner.recorded.find((r) => r.name === 'directive-infer')
      const prompt = recorded?.prompt ?? ''
      expect(prompt).toContain('[수정')
      expect(prompt).toContain('전:')
      expect(prompt).toContain('후:')
      // Ledger row with source inferred.
      const rows = await ctx.db
        .select()
        .from(authorDirectives)
        .where(and(eq(authorDirectives.workId, workId), eq(authorDirectives.source, 'inferred')))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      // Chapter 2 draft prefix uses the row.
      const drafts = readCallRecords(dir).filter(
        (c) => c.task === 'draft-chapter' && c.kind === 'stream' && c.step === 'ch2:draft',
      )
      expect(drafts.length).toBeGreaterThanOrEqual(1)
      expect(drafts[0]?.promptPrefix?.join('\n') ?? '').toContain('<author_requests>')
      // Pending is cleared after the answer.
      expect(readPending(dir)).toBeNull()
    } finally {
      await ctx.close()
    }
  }, 180_000)
})

describe('learn hunks only', () => {
  it('the inference prompt never holds the full chapter', async () => {
    const { createTestDb } = await import('@/test/db')
    const { createTestChapter, createTestUser, createTestWork } = await import('@/test/factories')
    const { inferDirectives } = await import('@/server/directive-infer')
    const db = await createTestDb()
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    const AI_TEXT = [
      '서윤은 문을 열었다.',
      '입꼬리가 올라갔다.',
      '안개가 방 안으로 들어왔다.',
      '그녀는 편지를 집어 들었다.',
      '창밖에서는 빗소리가 났다.',
      '밤이 깊었고 거리는 조용했다.',
    ].join(' ')
    const SAVED = AI_TEXT.replace('입꼬리가 올라갔다.', '그녀는 작게 웃었다.')
    const FAR = '밤이 깊었고 거리는 조용했다.'
    const chapter = await createTestChapter(db, work.id, { body: SAVED, status: 'done' })
    const { aiRuns, aiUsageEvents } = await import('@/db/schema')
    const [run] = await db
      .insert(aiRuns)
      .values({
        workId: work.id,
        userId: actor.userId,
        task: 'draft-chapter',
        status: 'done',
        output: { text: AI_TEXT },
      })
      .returning()
    await db.insert(aiUsageEvents).values({
      workId: work.id,
      userId: actor.userId,
      chapterId: chapter.id,
      runId: run.id,
      kind: 'draft_used',
      value: AI_TEXT.length,
      extra: { mode: 1, priorChars: 0 },
    })
    await db.insert(aiUsageEvents).values({
      workId: work.id,
      userId: actor.userId,
      chapterId: chapter.id,
      runId: run.id,
      kind: 'draft_edit_ratio',
      value: 0.2,
      extra: { aiChars: AI_TEXT.length, bodyChars: SAVED.length },
    })
    let seenPrompt = ''
    const inner = new FakeAiClient({
      overrides: {
        'directive-infer': (input: unknown) => {
          void input
          return {
            proposals: [
              {
                text: "'입꼬리'는 쓰지 않는다",
                kind: 'ban',
                entryName: null,
                pattern: '입꼬리',
                evidence: [1],
              },
            ],
          }
        },
      } as never,
    })
    const orig = inner.recorded
    void orig
    await inferDirectives(db, actor, { workId: work.id, chapterId: chapter.id }, inner as never)
    const rec = inner.recorded.find((r) => r.name === 'directive-infer')
    seenPrompt = rec?.prompt ?? ''
    expect(seenPrompt).toContain('[수정')
    expect(seenPrompt).not.toContain(FAR)
  })
})

describe('learn harness summary', () => {
  it('carries learnedAdded and inferMs from state into run-summary and resummarize', () => {
    const dir = mkdtempSync(join(tmpdir(), 'novel-finish-learn-s4-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'chapters'), { recursive: true })
    writeFileSync(join(dir, 'chapters', '01.md'), '세린이 웃었다.\n')
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ lang: 'ko', modelId: 'fake', chapters: 1 }),
    )
    const state = newState({
      runId: 'test',
      modelId: 'fake',
      lang: 'ko',
      chapters: 1,
      questions: 1,
      maxDraftAttempts: 2,
      createdAt: '2026-10-20T00:00:00.000Z',
      commit: 'test',
    })
    state.data.learnedAdded = { 1: 2 }
    state.data.inferMs = { 1: 123 }
    const summary = buildRunSummary([], state, 'ko', readSummaryInputs(dir))
    expect(summary.harness?.chapters[0]?.learnedAdded).toBe(2)
    expect(summary.harness?.chapters[0]?.inferMs).toBe(123)
    const rebuilt = buildRunSummary([], state, 'ko', readSummaryInputs(dir))
    expect(rebuilt.harness?.chapters[0]?.learnedAdded).toBe(2)
    expect(rebuilt.harness?.chapters[0]?.inferMs).toBe(123)
  })
})
