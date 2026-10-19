import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAiClient } from '@/ai'
import { buildContextPack, CONTINUITY_BUDGET_CHARS, renderContextPack } from '@/ai/context'
import { FakeAiClient } from '@/test/fake-ai'
import { runAiTask } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import { continuityCheckTask, resolveContinuityIssues } from '@/ai/tasks/continuity-check'
import type { Db } from '@/db/client'
import { chapters, namingRules, threads } from '@/db/schema'
import {
  type ChapterRow,
  ENTRY_KINDS,
  FACT_STATUSES,
  IMPORTANCE,
  ISSUE_KINDS,
  type IssueKind,
  THREAD_STATUSES,
} from '@/db/types'
import { getAiProvider } from '@/lib/ai-mode'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { type CoverageCard, packCoverage } from './coverage'
import {
  type ExpectedIssue,
  type FoundIssue,
  type IssueScore,
  scoreIssues,
  scoreNotDefects,
} from './score'

// Continuity accuracy eval (spec §12). Loads the made-up fixture novel into an in-memory database,
// runs the continuity check on every chapter, and scores the reported issues against answers.json.
//
//   pnpm eval:continuity           real API (needs ANTHROPIC_API_KEY or OPENCODE_API_KEY), otherwise prints a skip message
//   pnpm eval:continuity --fake    deterministic fake client, checks the run flow only
//   --fixture <name>               a set under eval/fixtures (default: continuity)
//   --budget <n>                   continuity context budget in characters (default: CONTINUITY_BUDGET_CHARS)

const RESULTS_DIR = path.resolve(process.cwd(), 'eval/results')
const SKIP_MESSAGE =
  'AI 키(ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY)가 없어 평가를 건너뜁니다. --fake로 실행 흐름만 확인할 수 있습니다.'

const WorkFixtureSchema = z.object({
  title: z.string(),
  chapters: z.array(
    z.object({ position: z.number().int(), title: z.string(), summary: z.string() }),
  ),
  entries: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      kind: z.enum(ENTRY_KINDS),
      aliases: z.array(z.string()),
      summary: z.string(),
    }),
  ),
  facts: z.array(
    z.object({
      entry: z.string(),
      content: z.string(),
      status: z.enum(FACT_STATUSES),
      sourceChapter: z.number().int().nullable(),
      validFromPosition: z.number().int().nullable(),
      validToPosition: z.number().int().nullable(),
    }),
  ),
  threads: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      status: z.enum(THREAD_STATUSES),
      plantedChapter: z.number().int().nullable(),
      targetChapter: z.number().int().nullable(),
      importance: z.enum(IMPORTANCE),
    }),
  ),
  namingRules: z.array(
    z.object({ canonical: z.string(), variants: z.array(z.string()), note: z.string() }),
  ),
})

const AnswersSchema = z.object({
  expected: z.array(
    z.object({
      chapter: z.number().int(),
      quoteIncludes: z.string().min(1),
      kind: z.enum(ISSUE_KINDS),
    }),
  ),
  notDefects: z.array(
    z.object({ chapter: z.number().int(), quoteIncludes: z.string().min(1), reason: z.string() }),
  ),
})

type WorkFixture = z.infer<typeof WorkFixtureSchema>
type Answers = z.infer<typeof AnswersSchema>

type ChapterFixture = { position: number; title: string; body: string }

type ChapterRun = {
  position: number
  title: string
  pack: {
    entries: number
    threads: number
    approxChars: number
    /** Cards named in the manuscript, and how many of them reach the rendered pack. */
    named: number
    namedInPack: number
  }
  issues: { quote: string; kind: IssueKind; severity: string; explanation: string }[]
  error: string | null
}

/** Value of a `--flag <value>` pair, or undefined when the flag is absent. */
function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} 값이 없습니다.`)
  return value
}

function parseBudget(): number {
  const raw = argValue('--budget')
  if (raw === undefined) return CONTINUITY_BUDGET_CHARS
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`--budget 값이 올바르지 않습니다: ${raw}`)
  return value
}

function parseFixtureDir(): string {
  const name = argValue('--fixture') ?? 'continuity'
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`--fixture 이름이 올바르지 않습니다: ${name}`)
  return path.resolve(process.cwd(), 'eval/fixtures', name)
}

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
}

function loadChapterBodies(dir: string, work: WorkFixture): ChapterFixture[] {
  return work.chapters.map((ch) => {
    const file = path.join(dir, 'chapters', `${String(ch.position).padStart(2, '0')}.md`)
    return { position: ch.position, title: ch.title, body: readFileSync(file, 'utf8').trim() }
  })
}

/** Fails fast when the answer key does not match the fixture text. */
function checkAnswers(answers: Answers, bodies: ChapterFixture[]): void {
  const byPosition = new Map(bodies.map((c) => [c.position, c.body]))
  for (const item of [...answers.expected, ...answers.notDefects]) {
    const body = byPosition.get(item.chapter)
    if (body === undefined) throw new Error(`정답표의 ${item.chapter}화가 원고에 없습니다.`)
    if (!body.includes(item.quoteIncludes)) {
      throw new Error(`정답표 문구가 ${item.chapter}화 원고에 없습니다: ${item.quoteIncludes}`)
    }
  }
}

function requireId(ids: Map<string, string>, key: string, label: string): string {
  const id = ids.get(key)
  if (id === undefined) throw new Error(`${label} "${key}"을(를) work.json에서 찾을 수 없습니다.`)
  return id
}

/** Writes the fixture (entries, facts, threads, naming rules, chapters) into the database. */
async function loadWork(
  db: Db,
  workId: string,
  work: WorkFixture,
  bodies: ChapterFixture[],
): Promise<Map<number, ChapterRow>> {
  const bodyByPosition = new Map(bodies.map((c) => [c.position, c.body]))
  const chapterRows = new Map<number, ChapterRow>()
  for (const ch of work.chapters) {
    const row = await createTestChapter(db, workId, {
      position: ch.position,
      title: ch.title,
      body: bodyByPosition.get(ch.position) ?? '',
      status: 'draft',
    })
    if (ch.summary.trim() !== '') {
      await db.update(chapters).set({ summary: ch.summary }).where(eq(chapters.id, row.id))
    }
    chapterRows.set(ch.position, row)
  }

  const entryIds = new Map<string, string>()
  for (const e of work.entries) {
    const row = await createTestEntry(db, workId, {
      name: e.name,
      kind: e.kind,
      aliases: e.aliases,
      summary: e.summary,
    })
    entryIds.set(e.key, row.id)
  }

  for (const f of work.facts) {
    await createTestFact(db, workId, {
      content: f.content,
      entryId: requireId(entryIds, f.entry, '항목'),
      status: f.status,
      sourceChapterId:
        f.sourceChapter === null ? null : (chapterRows.get(f.sourceChapter)?.id ?? null),
      validFromPosition: f.validFromPosition,
      validToPosition: f.validToPosition,
    })
  }

  for (const t of work.threads) {
    await db.insert(threads).values({
      workId,
      title: t.title,
      description: t.description,
      status: t.status,
      importance: t.importance,
      plantedChapterId:
        t.plantedChapter === null ? null : (chapterRows.get(t.plantedChapter)?.id ?? null),
      targetChapterPosition: t.targetChapter,
    })
  }

  for (const r of work.namingRules) {
    await db.insert(namingRules).values({
      workId,
      canonical: r.canonical,
      variants: r.variants,
      note: r.note,
    })
  }

  return chapterRows
}

/** Runs the continuity check on one chapter. Errors are recorded so the other chapters still run. */
async function checkChapter(
  db: Db,
  meta: { userId: string; workId: string; chapterId: string },
  chapter: ChapterFixture,
  client: AiClient,
  options: { cards: CoverageCard[]; budgetChars: number },
): Promise<ChapterRun> {
  const run: ChapterRun = {
    position: chapter.position,
    title: chapter.title,
    pack: { entries: 0, threads: 0, approxChars: 0, named: 0, namedInPack: 0 },
    issues: [],
    error: null,
  }
  try {
    // Same options as the product continuity check (chapter-check.ts).
    const pack = await buildContextPack(db, meta.workId, {
      text: chapter.body,
      position: chapter.position,
      keepNamed: true,
      budgetChars: options.budgetChars,
    })
    const coverage = packCoverage(chapter.body, options.cards, renderContextPack(pack))
    run.pack = {
      entries: pack.entries.length,
      threads: pack.threads.length,
      approxChars: pack.stats.approxChars,
      named: coverage.named.length,
      namedInPack: coverage.named.length - coverage.missing.length,
    }
    const input = {
      chapterText: chapter.body,
      chapterPosition: chapter.position,
      chapterTitle: chapter.title,
      pack,
    }
    const { output } = await runAiTask(
      db,
      { userId: meta.userId, workId: meta.workId, chapterId: meta.chapterId },
      continuityCheckTask,
      input,
      client,
    )
    run.issues = resolveContinuityIssues(output, input).map((issue) => ({
      quote: issue.quote,
      kind: issue.kind,
      severity: issue.severity,
      explanation: issue.explanation,
    }))
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error)
  }
  return run
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

type RunExtras = {
  trapHits: FoundIssue[]
  coverage: { named: number; inPack: number; rate: number }
  overBudgetChapters: number
}

function printSummary(
  positions: number[],
  expected: ExpectedIssue[],
  found: FoundIssue[],
  runs: ChapterRun[],
  totals: IssueScore,
  extras: RunExtras,
): void {
  const rows = positions.map((position) => {
    const exp = expected.filter((e) => e.chapter === position)
    const fnd = found.filter((f) => f.chapter === position)
    const score = scoreIssues(exp, fnd)
    const run = runs.find((r) => r.position === position)
    return {
      회차: `${position}화`,
      정답: exp.length,
      지적: fnd.length,
      적중: score.hits,
      놓침: score.misses.length,
      오탐: score.falsePositives.length,
      실패: run?.error ? '오류' : '',
    }
  })
  console.table(rows)
  console.log(
    `합계: 정답 ${expected.length}건 · 적중 ${totals.hits} · 놓침 ${totals.misses.length} · 오탐 ${totals.falsePositives.length} · 정밀도 ${percent(totals.precision)} · 재현율 ${percent(totals.recall)}`,
  )
  console.log(
    `함정 오탐 ${extras.trapHits.length}건 · 맥락 포함률 ${percent(extras.coverage.rate)} (${extras.coverage.inPack}/${extras.coverage.named}) · 예산 초과 ${extras.overBudgetChapters}장`,
  )
}

async function main(): Promise<void> {
  const useFake = process.argv.includes('--fake')
  const fixtureDir = parseFixtureDir()
  const budgetChars = parseBudget()
  if (!useFake && getAiProvider() === null) {
    console.log(SKIP_MESSAGE)
    return
  }

  const work = WorkFixtureSchema.parse(readJson(fixtureDir, 'work.json'))
  const answers = AnswersSchema.parse(readJson(fixtureDir, 'answers.json'))
  const bodies = loadChapterBodies(fixtureDir, work)
  checkAnswers(answers, bodies)
  const cards: CoverageCard[] = work.entries.map((e) => ({ name: e.name, aliases: e.aliases }))

  const client: AiClient = useFake ? new FakeAiClient() : getAiClient()
  const db = await createTestDb()
  const owner = await createTestUser(db)
  const workRow = await createTestWork(db, owner.id, { title: work.title })
  const chapterRows = await loadWork(db, workRow.id, work, bodies)

  console.log(
    `${work.title} · ${bodies.length}화 · 모델 ${client.defaultModel}${useFake ? ' (--fake, 가짜 응답)' : ''} · 예산 ${budgetChars}자`,
  )

  const runs: ChapterRun[] = []
  for (const chapter of bodies) {
    const row = chapterRows.get(chapter.position)
    if (!row) throw new Error(`${chapter.position}화 행이 없습니다.`)
    console.log(`점검 중: ${chapter.position}화 ${chapter.title}`)
    runs.push(
      await checkChapter(
        db,
        { userId: owner.id, workId: workRow.id, chapterId: row.id },
        chapter,
        client,
        { cards, budgetChars },
      ),
    )
  }

  const expected: ExpectedIssue[] = answers.expected
  const found: FoundIssue[] = runs.flatMap((run) =>
    run.issues.map((issue) => ({
      chapter: run.position,
      quote: issue.quote,
      kind: issue.kind,
    })),
  )
  const totals = scoreIssues(expected, found)
  const positions = bodies.map((c) => c.position)
  const trapHits = scoreNotDefects(answers.notDefects, found)
  const named = runs.reduce((sum, run) => sum + run.pack.named, 0)
  const inPack = runs.reduce((sum, run) => sum + run.pack.namedInPack, 0)
  const extras: RunExtras = {
    trapHits,
    coverage: { named, inPack, rate: named === 0 ? 1 : inPack / named },
    overBudgetChapters: runs.filter((run) => run.pack.approxChars > budgetChars).length,
  }

  printSummary(positions, expected, found, runs, totals, extras)
  if (useFake) {
    console.log('※ --fake 실행입니다. 가짜 응답으로 흐름만 확인했으며 점수는 모델 품질이 아닙니다.')
  }

  const failed = runs.filter((r) => r.error !== null)
  for (const run of failed) console.log(`${run.position}화 오류: ${run.error}`)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(RESULTS_DIR, { recursive: true })
  const outFile = path.join(RESULTS_DIR, `continuity-${stamp}.json`)
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        mode: client.provider,
        model: client.defaultModel,
        createdAt: new Date().toISOString(),
        fixture: path.basename(fixtureDir),
        budgetChars,
        expected,
        notDefects: answers.notDefects,
        totals,
        trapHits,
        coverage: extras.coverage,
        overBudgetChapters: extras.overBudgetChapters,
        runs,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`결과 저장: ${outFile}`)

  if (failed.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
