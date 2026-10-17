import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { getImportModel } from '@/ai'
import {
  extractionToProposals,
  type ExtractionContext,
  type Extraction,
  type PendingThreadEvent,
} from '@/ai/extraction'
import { runAiTask } from '@/ai/run'
import type { AiClient, AiTaskDef } from '@/ai/types'
import { type ChapterExtractInput, chapterExtractTask } from '@/ai/tasks/chapter-extract'
import type { Db } from '@/db/client'
import {
  chapters,
  facts,
  importJobs,
  proposals,
  relations,
  threads,
  wikiEntries,
} from '@/db/schema'
import type { Actor, ImportJobRow, ImportJobStatus, ProposalRow } from '@/db/types'
import { inngest, isInngestEnabled } from '@/inngest/client'
import { isAppError, AppError } from '@/lib/errors'
import { isPlausibleIsoDate } from '@/lib/dates'
import { stripJosa } from '@/lib/korean'
import {
  type NewProposal,
  type ProposalPayloadMap,
  parseProposalPayload,
} from '@/lib/proposal-payloads'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { createChaptersBulk } from '@/server/chapters'
import { insertProposals } from '@/server/proposal-store'

// Manuscript import jobs (F6). A job holds the uploaded chapters and a cursor. Each advance call
// runs chapter-extract for the chapter at the cursor and stores the result as import proposals;
// the cursor moves only when the result is saved, guarded by `cursor = expected`, so two calls
// running at the same time never process the same chapter twice. Nothing here writes wiki rows.

export const MAX_IMPORT_CHAPTERS = 2000
const MAX_UPLOAD_BATCH = 50
const MAX_KNOWN_FACTS = 200
const MAX_OPEN_THREADS = 100
const IMPORT_EVENT = 'import/run'

const TOTAL_MESSAGE = '회차 수가 올바르지 않습니다.'
const BATCH_MESSAGE = '한 번에 50화까지 올릴 수 있습니다.'
const OVER_TOTAL_MESSAGE = '올린 회차가 전체 회차 수를 넘습니다.'
const UPLOADING_ONLY_MESSAGE = '업로드 중인 작업에만 회차를 올릴 수 있습니다.'
const START_EARLY_MESSAGE = '모든 회차를 올린 뒤에 시작할 수 있습니다.'
const START_STATE_MESSAGE = '이 상태에서는 시작할 수 없습니다.'
const RACE_MESSAGE = '작업 상태가 바뀌었습니다. 다시 시도해 주세요.'
const SKIP_STATE_MESSAGE = '오류로 멈춘 작업에서만 이 화를 건너뛸 수 있습니다.'
const PUBLISHED_ON_MESSAGE = '연재일 형식이 올바르지 않습니다.'
const PAUSE_MESSAGE = '진행 중인 작업만 일시정지할 수 있습니다.'
const CANCEL_MESSAGE = '이미 끝났거나 취소된 작업입니다.'
const LIMIT_PAUSE_MESSAGE = '오늘 AI 사용량 한도에 도달해 일시정지했습니다. 내일 이어서 진행하세요.'
const GENERIC_ERROR_MESSAGE = '가져오기 중 오류가 발생했습니다. 다시 시작해 주세요.'
const MISSING_CHAPTER_MESSAGE = '회차를 찾을 수 없습니다. 작업을 취소하고 다시 올려 주세요.'

type ImportState = ImportJobRow['state']
type KnownEntity = ImportState['knownEntities'][number]
/** A chapter an author skipped after it stopped the job. Kept in state.skipped. */
type SkippedChapter = { chapterId: string; position: number; title: string; reason: string }
// skipImportChapter writes `skipped` into the jsonb state. The column type in schema.ts does not list it yet.
type ImportStateWithSkips = ImportState & { skipped?: SkippedChapter[] }
type ThreadCreatePayload = ProposalPayloadMap['thread_create']
type ThreadCreateItem = Extract<NewProposal, { type: 'thread_create' }>
type EntryCreateItem = Extract<NewProposal, { type: 'entry_create' }>

export type AdvanceResult = {
  status: ImportJobStatus
  processed: number
  total: number
  done: boolean
  message: string | null
}

/**
 * The extraction task with the import model (ANTHROPIC_MODEL_IMPORT). runAiTask reads the model
 * from the task definition, so the override lives here rather than in the shared task.
 */
const importExtractTask: AiTaskDef<ChapterExtractInput, Extraction> = {
  ...chapterExtractTask,
  model: () => getImportModel(),
}

/** Creates an uploading job. Editor role. */
export async function createImportJob(
  db: Db,
  actor: Actor,
  input: { workId: string; fileName: string; totalChapters: number },
): Promise<ImportJobRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  if (
    !Number.isInteger(input.totalChapters) ||
    input.totalChapters < 1 ||
    input.totalChapters > MAX_IMPORT_CHAPTERS
  ) {
    throw new AppError('VALIDATION', TOTAL_MESSAGE)
  }
  const [job] = await db
    .insert(importJobs)
    .values({
      workId: input.workId,
      fileName: input.fileName.trim() || '원고',
      status: 'uploading',
      chapterIds: [],
      totalChapters: input.totalChapters,
      createdBy: actor.userId,
    })
    .returning()
  return job
}

/**
 * Appends up to 50 chapters after the existing ones. Creates them as done chapters (version
 * source 'import') in the same transaction that records their ids on the job. With `publishedOn`
 * the new chapters are marked as already published that day, so they do not count as buffer.
 * Editor role.
 */
export async function appendImportChapters(
  db: Db,
  actor: Actor,
  input: {
    jobId: string
    chapters: { title: string; body: string }[]
    publishedOn?: string | null
  },
): Promise<{ appended: number; received: number }> {
  const workId = await requireRowWork(db, 'import_jobs', input.jobId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  if (input.chapters.length > MAX_UPLOAD_BATCH) throw new AppError('VALIDATION', BATCH_MESSAGE)
  if (input.publishedOn && !isPlausibleIsoDate(input.publishedOn)) {
    throw new AppError('VALIDATION', PUBLISHED_ON_MESSAGE)
  }

  return db.transaction(async (tx) => {
    const job = await lockJob(tx, input.jobId)
    if (job.status !== 'uploading') throw new AppError('BAD_STATE', UPLOADING_ONLY_MESSAGE)
    if (job.chapterIds.length + input.chapters.length > job.totalChapters) {
      throw new AppError('VALIDATION', OVER_TOTAL_MESSAGE)
    }
    if (input.chapters.length === 0) {
      return { appended: 0, received: job.chapterIds.length }
    }

    const created = await createChaptersBulk(tx, actor, {
      workId,
      chapters: input.chapters,
      status: 'done',
      versionSource: 'import',
    })
    if (input.publishedOn && created.length > 0) {
      await tx
        .update(chapters)
        .set({ publishedOn: input.publishedOn, updatedAt: new Date() })
        .where(
          inArray(
            chapters.id,
            created.map((chapter) => chapter.id),
          ),
        )
    }
    const chapterIds = [...job.chapterIds, ...created.map((chapter) => chapter.id)]
    await tx
      .update(importJobs)
      .set({ chapterIds, updatedAt: new Date() })
      .where(eq(importJobs.id, job.id))
    return { appended: created.length, received: chapterIds.length }
  })
}

/**
 * Starts an uploaded job, or resumes a paused or failed one. With Inngest configured the job is
 * handed to the `import/run` function; otherwise the import page drives it through the advance
 * route. Editor role.
 */
export async function startImportJob(db: Db, actor: Actor, jobId: string): Promise<ImportJobRow> {
  const workId = await requireRowWork(db, 'import_jobs', jobId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const job = await loadJob(db, jobId)

  if (job.status === 'uploading') {
    if (job.chapterIds.length !== job.totalChapters) {
      throw new AppError('BAD_STATE', START_EARLY_MESSAGE)
    }
  } else if (job.status !== 'paused' && job.status !== 'error') {
    throw new AppError('BAD_STATE', START_STATE_MESSAGE)
  }

  const useInngest = isInngestEnabled()
  const now = new Date()
  const [started] = await db
    .update(importJobs)
    .set({
      status: 'running',
      runner: useInngest ? 'inngest' : 'client',
      error: null,
      startedAt: job.startedAt ?? now,
      finishedAt: null,
      updatedAt: now,
    })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.status, job.status)))
    .returning()
  if (!started) throw new AppError('BAD_STATE', RACE_MESSAGE)

  if (!useInngest) return started
  try {
    await inngest.send({ name: IMPORT_EVENT, data: { jobId } })
    return started
  } catch (error) {
    // Without an event nobody advances the job, so hand it back to the import page.
    console.error('import/run event failed; the import page will drive this job', error)
    const [fallback] = await db
      .update(importJobs)
      .set({ runner: 'client', updatedAt: new Date() })
      .where(eq(importJobs.id, jobId))
      .returning()
    return fallback
  }
}

/**
 * Processes the chapter at the cursor. Callers check access. Returns the job status; a job that
 * is not running is returned unchanged. The AI daily limit pauses the job instead of failing it.
 */
export async function advanceImportJob(
  db: Db,
  jobId: string,
  o: { client?: AiClient; userId?: string } = {},
): Promise<AdvanceResult> {
  const job = await loadJob(db, jobId)
  if (job.status !== 'running') return toResult(job)

  const chapterId = job.chapterIds[job.cursor]
  const chapter = chapterId ? await loadChapter(db, chapterId) : undefined
  if (!chapter) return toResult(await failJob(db, jobId, MISSING_CHAPTER_MESSAGE))

  const entries = await loadEntries(db, job.workId)
  const dbKeys = new Set(entries.flatMap((e) => [e.name, ...e.aliases]).map(nameKey))
  const known: KnownEntity[] = [
    ...entries.map((e) => ({ name: e.name, kind: e.kind, aliases: e.aliases })),
    ...job.state.knownEntities.filter((k) => !dbKeys.has(nameKey(k.name))),
  ]
  const knownKeys = new Set(known.flatMap((k) => [k.name, ...k.aliases]).map(nameKey))

  const openRows = await loadOpenThreads(db, job.workId)
  const dbTitles = new Set(openRows.map((t) => t.title))
  const pendingTitles = job.state.threadTitles.filter((title) => !dbTitles.has(title))
  const threadRefs = new Map(openRows.map((t, i) => [`T${i + 1}`, { id: t.id, title: t.title }]))
  const openThreads = [
    ...openRows.map((t, i) => ({ ref: `T${i + 1}`, title: t.title, description: t.description })),
    ...pendingTitles.map((title, i) => ({ ref: `P${i + 1}`, title, description: '' })),
  ]

  const allThreads = await loadAllThreads(db, job.workId)
  const allRelations = await loadRelations(db, job.workId)

  const factRows = await loadKnownFacts(db, job.workId)
  const factRefs = new Map(factRows.map((f, i) => [`F${i + 1}`, { id: f.id }]))
  const knownFacts = factRows.map((f, i) => ({
    ref: `F${i + 1}`,
    subjectName: f.subjectName,
    content: f.content,
  }))

  let output: Extraction
  try {
    const result = await runAiTask(
      db,
      { userId: o.userId ?? job.createdBy, workId: job.workId, chapterId: chapter.id },
      importExtractTask,
      {
        chapterText: chapter.body,
        chapterPosition: chapter.position,
        chapterTitle: chapter.title,
        known,
        openThreads,
        knownFacts,
      },
      o.client,
    )
    output = result.output
  } catch (error) {
    if (isAppError(error) && error.code === 'AI_LIMIT') {
      return toResult(await pauseJob(db, jobId, LIMIT_PAUSE_MESSAGE))
    }
    const message = isAppError(error) ? error.message : GENERIC_ERROR_MESSAGE
    return toResult(await failJob(db, jobId, stoppedAt(chapter.position, message)))
  }

  // Entries the job already knows about are dropped here; extractionToProposals only knows the
  // saved cards, and pending entry_create proposals from earlier chapters are not among them.
  const plantedTitles = output.threads
    .filter((t) => t.kind === 'planted')
    .map((t) => t.title.trim())
  const context: ExtractionContext = {
    source: 'import',
    sourceRef: job.id,
    chapterId: chapter.id,
    chapterPosition: chapter.position,
    existingEntries: entries.map((e) => ({
      id: e.id,
      name: e.name,
      aliases: e.aliases,
      kind: e.kind,
    })),
    threadRefs,
    factRefs,
    pendingThreadTitles: new Set([...job.state.threadTitles, ...plantedTitles]),
    existingThreads: allThreads,
    existingRelations: allRelations.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      kind: r.kind,
      directed: r.directed,
      endPosition: r.endPosition,
    })),
  }
  const extraction: Extraction = {
    ...output,
    entries: output.entries.filter((e) => !knownKeys.has(nameKey(e.name))),
  }
  const { proposals: items, pendingThreadEvents } = extractionToProposals(extraction, context)

  // Spread keeps any `skipped` list the job already has.
  const nextState: ImportState = {
    ...job.state,
    knownEntities: mergeEntities([
      ...job.state.knownEntities,
      ...items.filter(isEntryCreate).map((i) => ({
        name: i.payload.name,
        kind: i.payload.kind,
        aliases: i.payload.aliases,
      })),
    ]),
    threadTitles: mergeTitles([
      ...job.state.threadTitles,
      ...items.filter(isThreadCreate).map((i) => i.payload.title),
    ]),
  }

  const now = new Date()
  const finished = job.cursor + 1 >= job.totalChapters
  let saved: ImportJobRow | null = null
  try {
    saved = await db.transaction(async (tx) => {
      const [won] = await tx
        .update(importJobs)
        .set({
          cursor: job.cursor + 1,
          processedChapters: sql`${importJobs.processedChapters} + 1`,
          proposalCount: sql`${importJobs.proposalCount} + ${items.length}`,
          state: nextState,
          status: finished ? 'done' : 'running',
          finishedAt: finished ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(importJobs.id, jobId),
            eq(importJobs.cursor, job.cursor),
            eq(importJobs.status, 'running'),
          ),
        )
        .returning()
      // Another call advanced or paused the job first: write nothing and report its state.
      if (!won) return null

      const pendingRows = await tx
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.workId, job.workId),
            eq(proposals.source, 'import'),
            eq(proposals.sourceRef, jobId),
            eq(proposals.type, 'thread_create'),
            eq(proposals.status, 'pending'),
          ),
        )
        .orderBy(asc(proposals.createdAt))
      await attachPendingEvents(tx, chapter.id, pendingThreadEvents, items, pendingRows)
      await insertProposals(tx, job.workId, items)
      return won
    })
  } catch (error) {
    // Proposal rows failed validation or could not be written. The cursor did not move, so the
    // job stops here and can be resumed once the cause is fixed.
    const message = isAppError(error) ? error.message : GENERIC_ERROR_MESSAGE
    return toResult(await failJob(db, jobId, stoppedAt(chapter.position, message)))
  }
  if (!saved) return toResult(await loadJob(db, jobId))
  return toResult(saved)
}

/** Pauses a running job. Editor role. */
export async function pauseImportJob(db: Db, actor: Actor, jobId: string): Promise<ImportJobRow> {
  const workId = await requireRowWork(db, 'import_jobs', jobId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [row] = await db
    .update(importJobs)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.status, 'running')))
    .returning()
  if (!row) throw new AppError('BAD_STATE', PAUSE_MESSAGE)
  return row
}

/**
 * Cancels a job that has not finished. Chapters and proposals already created stay. Editor role.
 */
export async function cancelImportJob(db: Db, actor: Actor, jobId: string): Promise<ImportJobRow> {
  const workId = await requireRowWork(db, 'import_jobs', jobId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const now = new Date()
  const [row] = await db
    .update(importJobs)
    .set({ status: 'cancelled', finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(importJobs.id, jobId),
        inArray(importJobs.status, ['uploading', 'running', 'paused', 'error']),
      ),
    )
    .returning()
  if (!row) throw new AppError('BAD_STATE', CANCEL_MESSAGE)
  return row
}

/**
 * Skips the chapter that stopped a job with an error. The chapter keeps its text and gets no
 * proposals. The cursor moves past it and the job is paused (or done, if it was the last one), so
 * the author resumes it with startImportJob. The skipped chapter is listed in state.skipped.
 * Editor role.
 */
export async function skipImportChapter(
  db: Db,
  actor: Actor,
  jobId: string,
): Promise<ImportJobRow> {
  const workId = await requireRowWork(db, 'import_jobs', jobId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  return db.transaction(async (tx) => {
    const job = await lockJob(tx, jobId)
    if (job.status !== 'error') throw new AppError('BAD_STATE', SKIP_STATE_MESSAGE)
    const chapterId = job.chapterIds[job.cursor]
    const chapter = chapterId ? await loadChapter(tx, chapterId) : undefined
    if (!chapter) throw new AppError('BAD_STATE', SKIP_STATE_MESSAGE)

    const finished = job.cursor + 1 >= job.totalChapters
    const now = new Date()
    const state: ImportStateWithSkips = {
      ...job.state,
      skipped: [
        ...skippedOf(job.state),
        {
          chapterId: chapter.id,
          position: chapter.position,
          title: chapter.title,
          reason: job.error ?? '',
        },
      ],
    }
    const [row] = await tx
      .update(importJobs)
      .set({
        cursor: job.cursor + 1,
        processedChapters: sql`${importJobs.processedChapters} + 1`,
        state,
        error: null,
        status: finished ? 'done' : 'paused',
        finishedAt: finished ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(importJobs.id, jobId),
          eq(importJobs.cursor, job.cursor),
          eq(importJobs.status, 'error'),
        ),
      )
      .returning()
    if (!row) throw new AppError('BAD_STATE', RACE_MESSAGE)
    return row
  })
}

/** One import job of a work. Viewer role. */
export async function getImportJob(db: Db, actor: Actor, jobId: string): Promise<ImportJobRow> {
  const workId = await requireRowWork(db, 'import_jobs', jobId)
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  return loadJob(db, jobId)
}

/** Import jobs of a work, newest first. Viewer role. */
export async function listImportJobs(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<ImportJobRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  return db
    .select()
    .from(importJobs)
    .where(eq(importJobs.workId, workId))
    .orderBy(desc(importJobs.createdAt))
}

// ---- helpers ----

/** Name comparison key: trimmed, with a trailing particle removed (서윤이 -> 서윤). */
function nameKey(name: string): string {
  return stripJosa(name.trim())
}

function toResult(job: ImportJobRow): AdvanceResult {
  return {
    status: job.status,
    processed: job.processedChapters,
    total: job.totalChapters,
    done: job.status === 'done',
    message: job.error,
  }
}

async function loadJob(db: Db, jobId: string): Promise<ImportJobRow> {
  const [row] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

/** Loads the job row and holds its lock until the transaction ends. */
async function lockJob(db: Db, jobId: string): Promise<ImportJobRow> {
  const [row] = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, jobId))
    .limit(1)
    .for('update')
  if (!row) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return row
}

async function loadChapter(db: Db, chapterId: string) {
  const [row] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1)
  return row
}

/** Non-archived entry cards of a work. */
async function loadEntries(db: Db, workId: string) {
  return db
    .select({
      id: wikiEntries.id,
      name: wikiEntries.name,
      aliases: wikiEntries.aliases,
      kind: wikiEntries.kind,
    })
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
    .orderBy(asc(wikiEntries.createdAt))
}

/** Open threads (not resolved or discarded), oldest first. */
async function loadOpenThreads(db: Db, workId: string) {
  return db
    .select({ id: threads.id, title: threads.title, description: threads.description })
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        notInArray(threads.status, ['resolved', 'discarded']),
      ),
    )
    .orderBy(asc(threads.createdAt))
    .limit(MAX_OPEN_THREADS)
}

/** Every non-archived thread of the work, whatever its status. */
async function loadAllThreads(db: Db, workId: string) {
  return db
    .select({ id: threads.id, title: threads.title, status: threads.status })
    .from(threads)
    .where(and(eq(threads.workId, workId), isNull(threads.archivedAt)))
}

/** Non-archived relations of the work. */
async function loadRelations(db: Db, workId: string) {
  return db
    .select({
      sourceId: relations.sourceEntryId,
      targetId: relations.targetEntryId,
      kind: relations.kind,
      directed: relations.directed,
      endPosition: relations.endPosition,
    })
    .from(relations)
    .where(and(eq(relations.workId, workId), isNull(relations.archivedAt)))
}

/** Current facts that have not been superseded, most recent first. */
async function loadKnownFacts(db: Db, workId: string) {
  return db
    .select({ id: facts.id, subjectName: facts.subjectName, content: facts.content })
    .from(facts)
    .where(
      and(eq(facts.workId, workId), isNull(facts.archivedAt), isNull(facts.supersededByFactId)),
    )
    .orderBy(desc(facts.createdAt))
    .limit(MAX_KNOWN_FACTS)
}

/** Error message for a job that stopped at a chapter, so the author sees where it stopped. */
function stoppedAt(position: number, message: string): string {
  return `${position}화에서 멈췄습니다: ${message}`
}

function skippedOf(state: ImportState): SkippedChapter[] {
  return (state as ImportStateWithSkips).skipped ?? []
}

async function pauseJob(db: Db, jobId: string, message: string): Promise<ImportJobRow> {
  return setRunningJobState(db, jobId, 'paused', message)
}

async function failJob(db: Db, jobId: string, message: string): Promise<ImportJobRow> {
  return setRunningJobState(db, jobId, 'error', message)
}

/** Moves a running job to paused or error with a message. Returns the current row if it was not running. */
async function setRunningJobState(
  db: Db,
  jobId: string,
  status: 'paused' | 'error',
  message: string,
): Promise<ImportJobRow> {
  const [row] = await db
    .update(importJobs)
    .set({ status, error: message, updatedAt: new Date() })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.status, 'running')))
    .returning()
  return row ?? loadJob(db, jobId)
}

function isEntryCreate(item: NewProposal): item is EntryCreateItem {
  return item.type === 'entry_create'
}

function isThreadCreate(item: NewProposal): item is ThreadCreateItem {
  return item.type === 'thread_create'
}

function mergeEntities(list: KnownEntity[]): KnownEntity[] {
  const seen = new Set<string>()
  return list.filter((entity) => {
    const key = nameKey(entity.name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeTitles(list: string[]): string[] {
  return [...new Set(list)]
}

/**
 * Attaches development and resolution events to the thread_create proposal of the same title.
 * A title planted in this same chapter takes the event in memory; an earlier pending proposal
 * of this job is updated in the transaction. Events with no matching proposal are dropped.
 */
async function attachPendingEvents(
  tx: Db,
  chapterId: string,
  pendingEvents: PendingThreadEvent[],
  items: NewProposal[],
  pendingRows: ProposalRow[],
): Promise<void> {
  const created = items.filter(isThreadCreate)
  const updated = new Map<string, ThreadCreatePayload>()
  for (const event of pendingEvents) {
    const entry = { kind: event.kind, chapterId, evidence: event.evidence }
    const inChapter = created.find((item) => item.payload.title === event.title)
    if (inChapter) {
      inChapter.payload.events.push(entry)
      continue
    }
    const row = pendingRows.find((r) => (r.payload as { title?: unknown }).title === event.title)
    if (!row) continue
    const payload = updated.get(row.id) ?? parseProposalPayload('thread_create', row.payload)
    payload.events.push(entry)
    updated.set(row.id, payload)
  }
  for (const [id, payload] of updated) {
    await tx.update(proposals).set({ payload }).where(eq(proposals.id, id))
  }
}
