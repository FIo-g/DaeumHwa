import { and, desc, eq, isNull } from 'drizzle-orm'
import { buildContextPack, renderContextPack } from '@/ai/context'
import { READER_PERSONAS, type Persona } from '@/ai/personas'
import { listAiRuns, runAiTask, startAiStream } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import {
  DRAFT_EFFORT,
  DRAFT_MAX_TOKENS,
  DRAFT_SYSTEM,
  buildDraftPrompt,
} from '@/ai/tasks/draft-chapter'
import { type AdviceResult, directionAdviceTask } from '@/ai/tasks/direction-advice'
import { type ReaderSimResult, readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import type { Db } from '@/db/client'
import { aiRuns, chapters } from '@/db/schema'
import {
  type Actor,
  type ChapterRow,
  type ProposalRow,
  type ThreadStatus,
  resolveWorkSettings,
} from '@/db/types'
import { AppError } from '@/lib/errors'
import { chapterLabel } from '@/lib/labels'
import { requireWorkRole } from '@/server/access'
import { getEntryAppearances } from '@/server/appearances'
import { assertEntryInWork, listFacts } from '@/server/facts'
import { insertProposals } from '@/server/proposal-store'
import {
  createChapter,
  getChapter,
  getLatestPosition,
  listChapters,
  type ChapterListItem,
} from '@/server/chapters'
import { listEntries } from '@/server/wiki'
import { listStyleCards } from '@/server/styles'
import { listThreads } from '@/server/threads'
import { getWork } from '@/server/works'

// AI features on top of the wiki (spec F11, F12, F13). Each AI call is recorded in ai_runs.
// Nothing here writes wiki tables: style cards go through proposals, drafts become chapters only
// when the author asks for it.

const OPEN_THREAD_STATUSES: ThreadStatus[] = ['planned', 'planted', 'developing']
const READER_PREVIOUS_SUMMARIES = 3
const ADVICE_RECENT_SUMMARIES = 5
const MIN_DIALOGUE_SAMPLES = 3
const MAX_DIALOGUE_SAMPLES = 40
const DRAFT_TAIL_CHARS = 1500
/** A line of dialogue: straight double quotes, curly double quotes, or Korean corner brackets. */
const DIALOGUE_RE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」/

// ---- Reader simulation (F11) ----

/** Runs the selected personas (all four by default) on one chapter. Editor role. */
export async function runReaderSimulation(
  db: Db,
  actor: Actor,
  input: { chapterId: string; personaIds?: string[] },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ runId: string; result: ReaderSimResult }> {
  const chapterRow = await getChapter(db, actor, input.chapterId)
  await requireWorkRole(db, chapterRow.workId, actor.userId, 'editor')
  if (chapterRow.body.trim() === '') {
    throw new AppError('VALIDATION', '원고가 비어 있어 독자 시뮬레이션을 할 수 없습니다.')
  }
  const work = await getWork(db, actor, chapterRow.workId)
  const all = await listChapters(db, actor, chapterRow.workId)
  const { output, runId } = await runAiTask(
    db,
    { userId: actor.userId, workId: chapterRow.workId, chapterId: chapterRow.id, signal },
    readerSimTask,
    {
      chapterText: chapterRow.body,
      chapterPosition: chapterRow.position,
      chapterTitle: chapterRow.title,
      previousSummaries: recentSummaries(all, READER_PREVIOUS_SUMMARIES, chapterRow.position).map(
        (s) => ({ position: s.position, summary: s.summary }),
      ),
      work: { title: work.title, genre: work.genre, logline: work.logline },
      personas: selectPersonas(input.personaIds),
    },
    client,
  )
  return { runId, result: output }
}

/** Finished reader-simulation runs of a work, newest first, optionally for one chapter. */
export async function listReaderSimRuns(
  db: Db,
  actor: Actor,
  workId: string,
  o: { chapterId?: string } = {},
) {
  return listAiRuns(db, actor, workId, { task: 'reader-sim', chapterId: o.chapterId })
}

function selectPersonas(ids?: string[]): Persona[] {
  if (!ids || ids.length === 0) return READER_PERSONAS
  const picked = READER_PERSONAS.filter((p) => ids.includes(p.id))
  if (picked.length === 0) throw new AppError('VALIDATION', '독자 페르소나를 하나 이상 고르세요.')
  return picked
}

// ---- Direction advice (F12) ----

/** Suggests three next-arc options from open threads, characters and recent summaries. Editor role. */
export async function runDirectionAdvice(
  db: Db,
  actor: Actor,
  input: { workId: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ runId: string; result: AdviceResult }> {
  const { workId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const work = await getWork(db, actor, workId)
  const latestPosition = await getLatestPosition(db, workId)
  const all = await listChapters(db, actor, workId)
  const threadViews = await listThreads(db, actor, workId, { statuses: OPEN_THREAD_STATUSES })
  const characters = await listEntries(db, actor, workId, { kinds: ['character'] })
  const allFacts = await listFacts(db, actor, workId)

  const factsByEntry = new Map<string, string[]>()
  for (const fact of allFacts) {
    if (!fact.entryId) continue
    const list = factsByEntry.get(fact.entryId) ?? []
    if (list.length < 5) list.push(fact.content)
    factsByEntry.set(fact.entryId, list)
  }

  const characterInputs: {
    name: string
    summary: string
    lastPosition: number | null
    keyFacts: string[]
  }[] = []
  for (const entry of characters) {
    const appearances = await getEntryAppearances(db, entry.id)
    const positions = appearances.filter((a) => a.mentionCount > 0).map((a) => a.position)
    characterInputs.push({
      name: entry.name,
      summary: entry.summary,
      lastPosition: positions.length > 0 ? Math.max(...positions) : null,
      keyFacts: factsByEntry.get(entry.id) ?? [],
    })
  }

  const { output, runId } = await runAiTask(
    db,
    { userId: actor.userId, workId, signal },
    directionAdviceTask,
    {
      work: {
        title: work.title,
        genre: work.genre,
        logline: work.logline,
        synopsis: work.synopsis,
      },
      latestPosition,
      threads: threadViews.map((t) => ({
        title: t.title,
        description: t.description,
        status: t.status,
        plantedPosition: t.plantedPosition,
        targetPosition: t.targetChapterPosition,
        overdue: t.overdue,
      })),
      characters: characterInputs,
      recentSummaries: recentSummaries(all, ADVICE_RECENT_SUMMARIES),
    },
    client,
  )
  return { runId, result: output }
}

/** Finished direction-advice runs of a work, newest first. */
export async function listAdviceRuns(db: Db, actor: Actor, workId: string) {
  return listAiRuns(db, actor, workId, { task: 'direction-advice' })
}

// ---- Style card suggestion (F13) ----

/**
 * Suggests a style card for one character from its dialogue lines in the manuscript and stores it
 * as a pending style_card proposal. Needs at least three dialogue lines. Editor role.
 */
export async function suggestStyleCard(
  db: Db,
  actor: Actor,
  input: { workId: string; entryId: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<ProposalRow> {
  const { workId, entryId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const entry = await assertEntryInWork(db, workId, entryId)
  const names = [entry.name, ...entry.aliases].filter((name) => name.trim() !== '')
  const samples = await collectDialogueSamples(db, workId, names)
  if (samples.length < MIN_DIALOGUE_SAMPLES) {
    throw new AppError('BAD_STATE', '이 인물의 대사를 원고에서 3줄 이상 찾지 못했습니다.')
  }
  const { output } = await runAiTask(
    db,
    { userId: actor.userId, workId, signal },
    styleSuggestTask,
    { entryName: entry.name, samples },
    client,
  )
  const [row] = await insertProposals(db, workId, [
    {
      type: 'style_card',
      payload: {
        entryName: entry.name,
        name: output.name,
        tone: output.tone,
        rules: output.rules,
        examples: output.examples,
      },
      source: 'style',
      sourceRef: entryId,
      chapterId: null,
    },
  ])
  return row
}

/** Lines that contain dialogue and mention one of the names, scanning chapters newest first. */
async function collectDialogueSamples(db: Db, workId: string, names: string[]): Promise<string[]> {
  const rows = await db
    .select({ body: chapters.body })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
    .orderBy(desc(chapters.position))
  const samples: string[] = []
  for (const row of rows) {
    for (const raw of row.body.split('\n')) {
      const line = raw.trim()
      if (!line || !DIALOGUE_RE.test(line)) continue
      if (!names.some((name) => line.includes(name))) continue
      if (samples.includes(line)) continue
      samples.push(line)
      if (samples.length >= MAX_DIALOGUE_SAMPLES) return samples
    }
  }
  return samples
}

// ---- Draft (F13) ----

/**
 * Starts a streamed chapter draft. The caller reads `textStream`; `done` resolves with the full
 * text once the run is stored. Nothing is written to the manuscript here. Editor role.
 */
export async function startDraft(
  db: Db,
  actor: Actor,
  input: {
    workId: string
    chapterId?: string | null
    instructions: string
    targetChars?: number
    entryIds: string[]
  },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ runId: string; textStream: AsyncIterable<string>; done: Promise<string> }> {
  const { workId } = input
  const instructions = input.instructions.trim()
  if (!instructions) throw new AppError('VALIDATION', '무슨 일이 일어나야 하는지 적어 주세요.')
  await requireWorkRole(db, workId, actor.userId, 'editor')

  const work = await getWork(db, actor, workId)
  const targetChars = input.targetChars ?? resolveWorkSettings(work.settings).targetChars
  const all = await listChapters(db, actor, workId)

  let position: number
  let chapterId: string | null = null
  let promptLabel: string
  let previous: ChapterListItem | undefined
  if (input.chapterId) {
    const chapter = await getChapter(db, actor, input.chapterId)
    if (chapter.workId !== workId) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
    position = chapter.position
    chapterId = chapter.id
    promptLabel = chapterLabel(chapter.position, chapter.title)
    previous = all.filter((c) => c.position < position).pop()
  } else {
    position = (await getLatestPosition(db, workId)) + 1
    promptLabel = `${position}화 (새 회차)`
    previous = all.length > 0 ? all[all.length - 1] : undefined
  }

  const previousBody = previous ? (await getChapter(db, actor, previous.id)).body : ''
  const previousTail = previousBody ? previousBody.slice(-DRAFT_TAIL_CHARS) : null
  const previousSummary = previous && previous.summary.trim() ? previous.summary.trim() : null

  const selected = new Set(input.entryIds)
  const styleCards = (await listStyleCards(db, actor, workId))
    .filter((card) => card.entryId === null || selected.has(card.entryId))
    .map((card) => ({
      name: card.name,
      entryName: card.entryName,
      tone: card.tone,
      rules: card.rules,
      examples: card.examples,
    }))

  const pack = await buildContextPack(db, workId, {
    text: instructions,
    position,
    extraEntryIds: input.entryIds,
  })
  const prompt = buildDraftPrompt({
    instructions,
    targetChars,
    styleCards,
    packText: renderContextPack(pack),
    previousSummary,
    previousTail,
    chapterLabel: promptLabel,
  })

  return startAiStream(
    db,
    { userId: actor.userId, workId, chapterId, signal },
    {
      task: 'draft-chapter',
      input: { instructions },
      effort: DRAFT_EFFORT,
      maxTokens: DRAFT_MAX_TOKENS,
      system: DRAFT_SYSTEM,
      prompt,
    },
    client,
  )
}

/**
 * Creates a new chapter from a finished draft run, with version source ai_draft. Only the
 * run's own author in the same work can use it. Editor role.
 */
export async function createChapterFromDraft(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; title?: string },
): Promise<ChapterRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, input.runId)).limit(1)
  if (
    !run ||
    run.workId !== input.workId ||
    run.userId !== actor.userId ||
    run.task !== 'draft-chapter'
  ) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (run.status !== 'done') {
    throw new AppError('BAD_STATE', '초안 작성이 끝난 뒤에 회차로 만들 수 있습니다.')
  }
  const text = draftText(run.output)
  if (text === null) throw new AppError('BAD_STATE', '저장된 초안을 읽을 수 없습니다.')
  return createChapter(db, actor, {
    workId: input.workId,
    title: input.title,
    body: text,
    versionSource: 'ai_draft',
  })
}

function draftText(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'text' in output) {
    const text = (output as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return null
}

// ---- Helpers ----

/** The last `count` chapters that have a summary, optionally only those before `before`. */
function recentSummaries(
  list: ChapterListItem[],
  count: number,
  before?: number,
): { position: number; title: string; summary: string }[] {
  return list
    .filter((c) => c.summary.trim() !== '' && (before === undefined || c.position < before))
    .slice(-count)
    .map((c) => ({ position: c.position, title: c.title, summary: c.summary }))
}
