import { and, desc, eq, isNull } from 'drizzle-orm'
import { getAiClient } from '@/ai'
import { buildContextPack, renderContextPack } from '@/ai/context'
import { READER_PERSONAS, type Persona } from '@/ai/personas'
import {
  isLocalProvider,
  listAiRuns,
  replaceRunOutput,
  runAiTask,
  runAiTaskSplit,
  startAiStream,
  STREAM_AI_TIMEOUT_MS,
  throwIfCancelled,
} from '@/ai/run'
import type { ForeignSpan } from '@/ai/guards'
import type { AiClient } from '@/ai/types'
import { draftModeFromEnv, type DraftMode } from '@/ai/draft-mode'
import {
  buildContinuationPrompt,
  buildDraftPrompt,
  buildScenePrompt,
  CONTINUE_EFFORT,
  CONTINUE_MAX_TOKENS,
  DRAFT_EFFORT,
  DRAFT_MAX_TOKENS,
  DRAFT_SYSTEM,
  type DraftPromptInput,
} from '@/ai/tasks/draft-chapter'
import { draftBeatsTask, type DraftBeats, renderBeats } from '@/ai/tasks/draft-beats'
import { applyDraftEdits, draftRepairTask, repairableForeignSpans } from '@/ai/tasks/draft-repair'
import { type AdviceResult, directionAdviceTask } from '@/ai/tasks/direction-advice'
import {
  mergeReaderSim,
  type ReaderSimInput,
  type ReaderSimResult,
  READER_SIM_CLOUD_TIMEOUT_MS,
  readerSimTask,
  splitReaderSimInput,
} from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { draftPlanTask, PLAN_MAX_SCENES } from '@/ai/tasks/draft-plan'
import {
  buildExpandPrompt,
  DRAFT_EXPAND_SYSTEM,
  EXPAND_EFFORT,
  EXPAND_MAX_TOKENS,
  expansionRejection,
  unwrapExpansion,
} from '@/ai/tasks/draft-expand'
import type { Db } from '@/db/client'
import { aiRuns, chapters } from '@/db/schema'
import {
  type Actor,
  type ChapterRow,
  type ProposalRow,
  type ThreadStatus,
  resolveWorkSettings,
} from '@/db/types'
import {
  continuationPlan,
  continuationSeparator,
  continueFailedWarning,
  draftCharCount,
  draftLengthPlan,
  type DraftWarning,
  isContinuationCommentary,
} from '@/lib/draft-length'
import {
  normalizeCard,
  planWarnings,
  type DraftPlanCard,
  type PlanEdits,
  renderPlanInstructions,
  withSceneTargets,
} from '@/lib/draft-plan'
import { AppError, isAppError } from '@/lib/errors'
import { chapterLabel } from '@/lib/labels'
import { createSceneEdgeFilter, sceneSpans, type SceneRange, spliceSpans } from '@/lib/scene'
import { type DraftFlag, findDraftFlags } from '@/lib/korean/style-copy'
import { sentenceIn, splitSentences } from '@/lib/korean/sentences'
import { splitParagraphs } from '@/lib/korean/paragraphs'
import { DRAFT_ERROR_MARK, DRAFT_REPLACE_MARK } from '@/lib/draft-stream'
import { createTextPipe, type TextPipe } from '@/lib/text-pipe'
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
import { isSpeechStyleEnabled, selectMainVoices } from '@/ai/voice'
import { listStyleCards } from '@/server/styles'
import { listThreads } from '@/server/threads'
import { getWork } from '@/server/works'
import { recordUsageEvent, updateDraftEditRatio } from '@/server/usage-events'

// AI features on top of the wiki (spec F11, F12, F13). Each AI call is recorded in ai_runs.
// Nothing here writes wiki tables: style cards go through proposals, drafts become chapters only
// when the author asks for it.

const OPEN_THREAD_STATUSES: ThreadStatus[] = ['planned', 'planted', 'developing']
const READER_PREVIOUS_SUMMARIES = 3
const ADVICE_RECENT_SUMMARIES = 5
const MIN_DIALOGUE_SAMPLES = 3
const MAX_DIALOGUE_SAMPLES = 40
const DRAFT_TAIL_CHARS = 1500
/** The first draft and its continuation share one budget, under the route's 300 s maxDuration. */
const DRAFT_TOTAL_BUDGET_MS = 290_000
/** The first stream is never given less than this, even when context building ate the budget. */
const MIN_FIRST_STREAM_MS = 10_000
/** A continuation is not started with less time left than this. */
const MIN_CONTINUATION_MS = 30_000
/** Expansion: at most this many short spans are rewritten in one draft. */
const MAX_EXPAND_SPANS = 4
/**
 * Expansion: spans in flight at once. Two keeps one run slot of the author free and matches
 * DEFAULT_CLOUD_SPLIT_CONCURRENCY.
 */
const EXPAND_CONCURRENCY = 2
/** A span under this share of its target is short enough to rewrite. */
const EXPAND_SHORT_RATIO = 1
/** A rewrite is asked for this many times its span's share: the middle of the 1.0x to 1.2x range. */
const EXPAND_ASK_RATIO = 1.1
/** Expansion rounds: round 2 fixes what round 1 left short, round 3 what a refused round 2 left. */
const EXPAND_ROUNDS = 3
/** Round 2 runs only while the draft is under this many times the target (a margin for trimming). */
const EXPAND_AGAIN_RATIO = 1.05
/** Round 2 asks a picked span for at least this many times its length. */
const EXPAND_MIN_GROWTH_ASK = 1.2
/** Characters of a refused rewrite kept in its EXPAND_REJECTED warning, after the failed check. */
const REJECTED_PREVIEW_CHARS = 300
/** Joins the scenes of a `scenes`-mode draft. The model is not asked to write it. */
const SCENE_SEPARATOR = '\n\n***\n\n'
/** The two marks of the draft stream (src/lib/draft-stream.ts). They never belong in draft text. */
const STREAM_MARKS = new RegExp(`[${DRAFT_REPLACE_MARK}${DRAFT_ERROR_MARK}]`, 'g')
/** Foreign-script repair (eval only): model calls at most, and sentences sent in one call. */
const MAX_REPAIR_ROUNDS = 2
const MAX_REPAIR_SENTENCES = 30
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
  const readerInput: ReaderSimInput = {
    chapterText: chapterRow.body,
    chapterPosition: chapterRow.position,
    chapterTitle: chapterRow.title,
    previousSummaries: recentSummaries(all, READER_PREVIOUS_SUMMARIES, chapterRow.position).map(
      (s) => ({ position: s.position, summary: s.summary }),
    ),
    work: { title: work.title, genre: work.genre, logline: work.logline },
    personas: selectPersonas(input.personaIds),
  }
  const meta = {
    userId: actor.userId,
    workId: chapterRow.workId,
    chapterId: chapterRow.id,
    signal,
  }
  const aiClient = client ?? getAiClient()
  // Local servers answer slowly, so one call per persona keeps each call inside the time limit; the
  // result is still one run row. Cloud providers keep one call with a longer limit (spec section 8:
  // local-only behavior is gated by provider).
  const { output, runId } = isLocalProvider(aiClient.provider)
    ? await runAiTaskSplit(
        db,
        meta,
        readerSimTask,
        splitReaderSimInput(readerInput),
        mergeReaderSim,
        aiClient,
      )
    : await runAiTask(
        db,
        { ...meta, timeoutMs: READER_SIM_CLOUD_TIMEOUT_MS },
        readerSimTask,
        readerInput,
        aiClient,
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
  throwIfCancelled(signal)
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
 * The draft context of a chapter: the previous chapter's tail and summary, the style cards, the
 * context pack and the prompt input. Shared by startDraft and planDraft. Does not check the role.
 * The wiki entries are picked by name from `packText` (default: the instructions). With
 * `seedPackFromPrevious` and no packText, an empty instruction line is replaced by the previous
 * chapter's summary and tail, so the cast already in play reaches the pack.
 */
export async function buildDraftContext(
  db: Db,
  actor: Actor,
  input: {
    workId: string
    chapterId?: string | null
    instructions: string
    targetChars?: number
    entryIds: string[]
    packText?: string
    seedPackFromPrevious?: boolean
  },
): Promise<{
  promptInput: DraftPromptInput
  chapterId: string | null
  position: number
  targetChars: number
}> {
  const { workId, instructions } = input
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
  // Speech feature (off by default): characters with a speech style go to <voices>, and their
  // style cards are kept even when the author did not select them.
  const speech = isSpeechStyleEnabled()
  const voices = speech
    ? selectMainVoices(
        (await listEntries(db, actor, workId, { kinds: ['character'] })).map((e) => ({
          entryId: e.id,
          name: e.name,
          speech: e.fields.speech ?? '',
          selected: selected.has(e.id),
          createdAt: e.createdAt,
        })),
      )
    : undefined
  const voiceIds = new Set((voices ?? []).map((v) => v.entryId))
  const styleCards = (await listStyleCards(db, actor, workId))
    .filter(
      (card) => card.entryId === null || selected.has(card.entryId) || voiceIds.has(card.entryId),
    )
    .map((card) => ({
      name: card.name,
      entryName: card.entryName,
      tone: card.tone,
      rules: card.rules,
      examples: card.examples,
    }))

  const seeded =
    input.seedPackFromPrevious && instructions === ''
      ? [previousSummary, previousTail].filter((part) => part !== null).join('\n')
      : instructions
  const pack = await buildContextPack(db, workId, {
    text: input.packText ?? seeded,
    position,
    extraEntryIds: input.entryIds,
  })
  const promptInput: DraftPromptInput = {
    instructions,
    targetChars,
    styleCards,
    packText: renderContextPack(pack, { markPlannedThreads: true }),
    previousSummary,
    previousTail,
    chapterLabel: promptLabel,
    voices: voices?.map((v) => ({ name: v.name, speech: v.speech })),
  }
  return { promptInput, chapterId, position, targetChars }
}

// ---- Chapter plan card (stage 1) ----

/**
 * Proposes the plan card of a chapter from the draft context. Empty instructions are allowed; the
 * card is stored only in the run output. Nothing is written to the manuscript or the wiki. With a
 * revision, the current card and the author's note go into the prompt. Editor role.
 */
export async function planDraft(
  db: Db,
  actor: Actor,
  input: {
    workId: string
    chapterId?: string | null
    instructions: string
    targetChars?: number
    entryIds: string[]
    revision?: { card: DraftPlanCard; note: string }
  },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ runId: string; card: DraftPlanCard; warnings: string[] }> {
  const { workId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')

  const { promptInput, chapterId, targetChars } = await buildDraftContext(db, actor, {
    workId,
    chapterId: input.chapterId,
    instructions: input.instructions.trim(),
    targetChars: input.targetChars,
    entryIds: input.entryIds,
    seedPackFromPrevious: true,
  })
  const revision = input.revision ?? null
  const { output, runId } = await runAiTask(
    db,
    { userId: actor.userId, workId, chapterId, signal },
    draftPlanTask,
    {
      ...promptInput,
      sceneCount: Math.min(
        PLAN_MAX_SCENES,
        revision ? revision.card.scenes.length : draftLengthPlan(targetChars).sceneCount,
      ),
      advice: await latestAdviceText(db, actor, workId),
      revision,
    },
    client,
  )
  const card = withSceneTargets(output, targetChars)

  // Counted once the run row exists. A failed count is only logged and never fails the plan.
  try {
    await recordUsageEvent(db, actor, {
      workId,
      chapterId,
      runId,
      kind: 'plan_shown',
      value: card.scenes.length,
      extra: { revision: revision ? 1 : 0 },
    })
  } catch (error) {
    console.warn('usage event plan_shown failed', error)
  }
  return { runId, card, warnings: planWarnings(card) }
}

/**
 * Text of the newest done direction advice of the work, or null when there is none. Advice runs
 * keep no chapter or position, so the newest run is the one used for the previous chapter.
 */
async function latestAdviceText(db: Db, actor: Actor, workId: string): Promise<string | null> {
  const [run] = await listAdviceRuns(db, actor, workId)
  const output = run?.output as Partial<AdviceResult> | null | undefined
  if (!output || !Array.isArray(output.options) || output.options.length === 0) return null
  return output.options.map((option) => `${option.title}: ${option.summary}`).join('\n')
}

/**
 * Starts a streamed chapter draft. The caller reads `textStream`; `done` resolves with the full
 * text once the run is stored. Nothing is written to the manuscript here. Editor role.
 * With `plan` (an approved card), the card is the draft's instructions and its scene count sets
 * the scene budget; empty instructions are then allowed. The run output keeps the card.
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
    /** Eval only: ask for a scene beat list first (draft-beats) and pass it into the prose prompt. */
    twoStep?: boolean
    /** The approved plan card from planDraft, as the author left it. Re-checked and re-targeted here. */
    plan?: DraftPlanCard
    /** Run id of the planDraft call that proposed the card. */
    planRunId?: string
    /** How the author changed the card; counted as plan_edited. */
    planEdits?: PlanEdits
    /** Comparison only: `scenes` writes one call per scene. Default from AI_DRAFT_MODE. Needs `plan`. */
    mode?: DraftMode
    /**
     * Whether a short draft is filled by rewriting its short scenes (the default). The route sets it
     * to false for a client that did not ask for the replace record: nothing is expanded then, and
     * the stream ends after the first text. It does not touch the `continue` length mode.
     */
    expandLength?: boolean
  },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{
  runId: string
  textStream: AsyncIterable<string>
  done: Promise<string>
  /** Set only for a two-step draft: the beat list the prose was written from. */
  beats?: DraftBeats
  beatsRunId?: string
}> {
  // First statement: the role check and the context work below count against the same budget.
  const startedAt = Date.now()
  const { workId } = input
  const instructions = input.instructions.trim()
  if (!instructions && !input.plan) {
    throw new AppError('VALIDATION', '무슨 일이 일어나야 하는지 적어 주세요.')
  }
  await requireWorkRole(db, workId, actor.userId, 'editor')

  const context = await buildDraftContext(db, actor, {
    workId,
    chapterId: input.chapterId,
    instructions,
    targetChars: input.targetChars,
    entryIds: input.entryIds,
    // With a plan, the entries are picked from the rendered card (scene characters, places,
    // summaries, ending, threads) as well as the author line. Only names are matched, so the
    // per-scene targets of the client card do not matter here.
    packText: input.plan ? renderPlanInstructions(instructions, input.plan) : undefined,
  })
  const { chapterId, targetChars } = context
  // The plan is the instruction: its scenes, threads and the author line become <instructions>.
  const card = input.plan ? normalizeCard(input.plan, targetChars) : null
  const promptInput: DraftPromptInput = card
    ? {
        ...context.promptInput,
        instructions: renderPlanInstructions(instructions, card),
        sceneCount: card.scenes.length,
      }
    : context.promptInput

  // Two-step draft (eval only): the beat list is made before the prose and goes into both prose
  // calls. A failed beat call rejects here, before any prose run exists. The beat call runs before
  // firstTimeoutMs is computed, so the prose budget already counts it.
  const beatsRun = input.twoStep
    ? await runAiTask(
        db,
        { userId: actor.userId, workId, chapterId, signal },
        draftBeatsTask,
        promptInput,
        client,
      )
    : null
  if (beatsRun && beatsRun.output.scenes.length === 0) {
    throw new AppError('AI_ERROR', '장면 목록을 만들지 못했습니다. 다시 시도해 주세요.')
  }
  const finalInput: DraftPromptInput = beatsRun
    ? {
        ...promptInput,
        beats: renderBeats(beatsRun.output),
        beatSceneCount: beatsRun.output.scenes.length,
      }
    : promptInput

  // The budget runs from the first line of startDraft, so the first stream gets what is left.
  const firstTimeoutMs = Math.max(
    MIN_FIRST_STREAM_MS,
    Math.min(STREAM_AI_TIMEOUT_MS, DRAFT_TOTAL_BUDGET_MS - (Date.now() - startedAt)),
  )
  // Scenes mode: the first call writes the first scene only, and completeScenes writes the rest.
  const scenesCard = card && (input.mode ?? draftModeFromEnv()) === 'scenes' ? card : null
  const first = await startAiStream(
    db,
    { userId: actor.userId, workId, chapterId, signal, timeoutMs: firstTimeoutMs },
    {
      task: 'draft-chapter',
      input: { instructions },
      effort: DRAFT_EFFORT,
      maxTokens: DRAFT_MAX_TOKENS,
      system: DRAFT_SYSTEM,
      prompt: scenesCard
        ? buildScenePrompt(finalInput, scenesCard, 0, '')
        : buildDraftPrompt(finalInput),
    },
    client,
  )

  // Counted once the run row exists, so a start blocked by the limit, the concurrency cap or the
  // chapter check is not a draft start. A failed count is only logged and never blocks the draft.
  try {
    await recordUsageEvent(db, actor, {
      workId,
      chapterId,
      runId: first.runId,
      kind: 'draft_started',
      value: instructions.length,
      extra: { targetChars },
    })
  } catch (error) {
    console.warn('usage event draft_started failed', error)
  }
  if (card) {
    const edits = input.planEdits ?? { revisions: 0, removed: 0, moved: 0, textEdits: 0 }
    try {
      await recordUsageEvent(db, actor, {
        workId,
        chapterId,
        runId: first.runId,
        kind: 'plan_edited',
        value: edits.revisions + edits.removed + edits.moved + edits.textEdits,
        extra: { ...edits },
      })
    } catch (error) {
      console.warn('usage event plan_edited failed', error)
    }
  }

  const pipe = createTextPipe()
  const ctx: DraftContext = {
    db,
    actor,
    workId,
    chapterId,
    promptInput: finalInput,
    client,
    signal,
    startedAt,
    card,
    expandLength: input.expandLength ?? true,
  }
  const drafted = scenesCard
    ? completeScenes(ctx, first, pipe, scenesCard)
    : completeDraft(ctx, first, pipe)
  // The plan joins the run output once the text is final, so the stored text is still the one streamed.
  // The text is already stored and streamed here, so a lost plan annotation must not fail the draft.
  const done = card
    ? drafted.then(async (text) => {
        try {
          await keepPlanInRun(db, first.runId, card, input.planRunId)
        } catch (error) {
          console.warn('plan merge into the draft run failed', error)
        }
        return text
      })
    : drafted
  // Callers that only read the text stream must not see an unhandled rejection.
  done.catch(() => {})
  return {
    runId: first.runId,
    textStream: pipe.iterable,
    done,
    beats: beatsRun?.output,
    beatsRunId: beatsRun?.runId,
  }
}

type DraftContext = {
  db: Db
  actor: Actor
  workId: string
  chapterId: string | null
  promptInput: DraftPromptInput
  client?: AiClient
  signal?: AbortSignal
  startedAt: number
  /** The approved plan card of this draft, or null without one. */
  card: DraftPlanCard | null
  /** False skips the expand path (the client cannot show a replace record). */
  expandLength: boolean
}

/** Removes the stream marks from model text, so the draft framing cannot be confused with prose. */
function stripStreamMarks(text: string): string {
  return text.replace(STREAM_MARKS, '')
}

/** How a short draft is filled (spec 6.4): `expand` by default, `continue` for the append path. */
export type DraftLengthMode = 'expand' | 'continue'

export function draftLengthModeFromEnv(
  env: Record<string, string | undefined> = process.env,
): DraftLengthMode {
  return env.AI_DRAFT_LENGTH_MODE === 'continue' ? 'continue' : 'expand'
}

/**
 * Finishes a draft (spec 7). The first stream is passed on to `pipe` as it arrives. A draft short
 * of the target is filled after it: in `expand` mode (the default) its short scenes are rewritten
 * in place (expandDraft), in `continue` mode one continuation is appended (continueDraft).
 * Only a user abort rejects.
 */
async function completeDraft(
  ctx: DraftContext,
  first: { runId: string; textStream: AsyncIterable<string>; done: Promise<string> },
  pipe: TextPipe,
): Promise<string> {
  let firstText: string
  try {
    for await (const chunk of first.textStream) pipe.push(stripStreamMarks(chunk))
    const stored = await first.done
    firstText = stripStreamMarks(stored)
    // Stored, streamed and (later) replaced text must match, so the run row gets the stripped text.
    if (firstText !== stored) await replaceRunOutput(ctx.db, first.runId, { text: firstText })
  } catch (error) {
    pipe.fail(error)
    throw error
  }

  if (draftLengthModeFromEnv() === 'continue') return continueDraft(ctx, first, pipe, firstText)
  if (!ctx.expandLength) {
    pipe.end()
    return firstText
  }
  return expandDraft(ctx, first, pipe, firstText)
}

/**
 * The append path (`AI_DRAFT_LENGTH_MODE=continue`). One continuation is buffered: its text reaches
 * the stream only once it has succeeded. A failed or empty continuation keeps the first text and
 * records a warning in the first run row.
 */
async function continueDraft(
  ctx: DraftContext,
  first: { runId: string; textStream: AsyncIterable<string>; done: Promise<string> },
  pipe: TextPipe,
  firstText: string,
): Promise<string> {
  const { db, workId, chapterId, promptInput, client, signal } = ctx
  const plan = continuationPlan(draftCharCount(firstText), promptInput.targetChars)
  const remaining = Math.min(
    DRAFT_TOTAL_BUDGET_MS - (Date.now() - ctx.startedAt),
    STREAM_AI_TIMEOUT_MS,
  )
  // Skips are not failures: they make no call and record no warning.
  if (plan === null || signal?.aborted || remaining < MIN_CONTINUATION_MS) {
    pipe.end()
    return firstText
  }

  let addition: string
  try {
    const cont = await startAiStream(
      db,
      { userId: ctx.actor.userId, workId, chapterId, signal, timeoutMs: remaining },
      {
        task: 'draft-continue',
        input: { instructions: promptInput.instructions },
        effort: CONTINUE_EFFORT,
        maxTokens: CONTINUE_MAX_TOKENS,
        system: DRAFT_SYSTEM,
        prompt: buildContinuationPrompt(promptInput, firstText),
      },
      client,
    )
    addition = stripStreamMarks(await cont.done)
  } catch (error) {
    if (signal?.aborted) {
      pipe.fail(error)
      throw error
    }
    const reason = isAppError(error) ? error.code : 'UNKNOWN'
    const detail = error instanceof Error ? error.message : String(error)
    await recordWarnings(db, first.runId, firstText, [continueFailedWarning(reason, detail)])
    pipe.end()
    return firstText
  }

  const text = addition.trimStart()
  if (text.trim() === '') {
    await recordWarnings(db, first.runId, firstText, [
      continueFailedWarning('EMPTY', 'The continuation is empty.'),
    ])
    pipe.end()
    return firstText
  }
  // A draft that already ends on its final line makes some models explain why they will not add
  // more. That note must never be glued to the story, so the shorter draft stands.
  if (isContinuationCommentary(text)) {
    await recordWarnings(db, first.runId, firstText, [
      continueFailedWarning('COMMENTARY', text.slice(0, 300)),
    ])
    pipe.end()
    return firstText
  }

  const joined = firstText + continuationSeparator(firstText) + text
  // Stored and streamed text must match, so a failure here rejects instead of keeping one half.
  try {
    await replaceRunOutput(db, first.runId, { text: joined })
  } catch (error) {
    pipe.fail(error)
    throw error
  }
  pipe.push(joined.slice(firstText.length))
  pipe.end()
  return joined
}

/** What became of one picked span: it never started, or its expansion text or its error. */
type ExpandOutcome =
  | { status: 'skipped' }
  | { status: 'fulfilled'; value: string }
  | { status: 'rejected'; reason: unknown }

/**
 * One expansion round: the draft length below which it runs, the multiple of a span's share under
 * which a span is picked, and the length asked for a picked span. `ask` gets the span's current
 * length and share, the draft's current length and the number of picked spans.
 */
type ExpandPass = {
  limit: number
  pickRatio: number
  ask: (span: { length: number; share: number }, total: number, picked: number) => number
}

/**
 * The expand path (default), in up to EXPAND_ROUNDS rounds. Round 1 splits the first text into scene
 * spans (sceneSpans). Each span under its share of the target is rewritten in place, asked for
 * EXPAND_ASK_RATIO times the share. Rounds 2 and 3 share rules: each runs on the spliced text while
 * it is under EXPAND_AGAIN_RATIO times the target, picks the spans under EXPAND_ASK_RATIO times their
 * share, and asks each for the larger of EXPAND_MIN_GROWTH_ASK times its length and its part of the
 * gap to the middle of the range. Each round rewrites up to MAX_EXPAND_SPANS spans, EXPAND_CONCURRENCY at a
 * time, with the end of the span before and the start of the span after as context (expandRound).
 * A round with an accepted rewrite stores its text and sends one replace record. Any other span keeps
 * its text and records a warning whose detail starts with the failed check; warnings from every round
 * are kept. A round is not started with less than MIN_CONTINUATION_MS of the budget left. Only a user
 * abort rejects, and then nothing half-spliced is stored and no further span is started.
 */
async function expandDraft(
  ctx: DraftContext,
  first: { runId: string; textStream: AsyncIterable<string>; done: Promise<string> },
  pipe: TextPipe,
  firstText: string,
): Promise<string> {
  const { db, promptInput } = ctx
  const targetChars = promptInput.targetChars
  const roundTwo: ExpandPass = {
    limit: targetChars * EXPAND_AGAIN_RATIO,
    pickRatio: EXPAND_ASK_RATIO,
    ask: (span, total, picked) =>
      Math.max(
        Math.round(span.length * EXPAND_MIN_GROWTH_ASK),
        Math.round(span.length + (targetChars * EXPAND_ASK_RATIO - total) / picked),
      ),
  }
  const passes: ExpandPass[] = [
    {
      limit: targetChars,
      pickRatio: EXPAND_SHORT_RATIO,
      ask: (span) => Math.round(span.share * EXPAND_ASK_RATIO),
    },
    roundTwo,
    // Round 3 uses the round-2 rules unchanged, on the text after round 2.
    roundTwo,
  ]

  let text = firstText
  const warnings: DraftWarning[] = []
  for (const pass of passes.slice(0, EXPAND_ROUNDS)) {
    const round = await expandRound(ctx, pipe, text, pass)
    text = round.text
    warnings.push(...round.warnings)
    if (round.accepted > 0) {
      // Stored text must be the text returned, so a failure here rejects instead of keeping one half.
      try {
        await replaceRunOutput(db, first.runId, warnings.length > 0 ? { text, warnings } : { text })
      } catch (error) {
        pipe.fail(error)
        throw error
      }
      pipe.replace(text)
    } else if (round.warnings.length > 0) {
      await recordWarnings(db, first.runId, text, warnings)
    }
  }
  pipe.end()
  return text
}

/**
 * One expansion round over `text`, as described in expandDraft. It returns the spliced text, the
 * number of accepted rewrites and the warnings of this round, and stores nothing. A round that is
 * skipped (the draft is at the pass limit, the author has aborted, or too little budget is left)
 * returns the text unchanged and makes no call. Only a user abort rejects, after pipe.fail.
 */
async function expandRound(
  ctx: DraftContext,
  pipe: TextPipe,
  text: string,
  pass: ExpandPass,
): Promise<{ text: string; accepted: number; warnings: DraftWarning[] }> {
  const { db, actor, workId, chapterId, promptInput, client, signal, card } = ctx
  const targetChars = promptInput.targetChars
  const remaining = Math.min(
    DRAFT_TOTAL_BUDGET_MS - (Date.now() - ctx.startedAt),
    STREAM_AI_TIMEOUT_MS,
  )
  // Skips are not failures: they make no call and record no warning.
  if (draftCharCount(text) >= pass.limit || signal?.aborted || remaining < MIN_CONTINUATION_MS) {
    return { text, accepted: 0, warnings: [] }
  }

  const spans = sceneSpans(text, card?.scenes.length ?? draftLengthPlan(targetChars).sceneCount)
  const spanText = (index: number): string => text.slice(spans[index].start, spans[index].end)
  // A card whose scene count matches the spans gives each span its own scene target.
  const shareOf = (index: number): number =>
    Math.round(
      card && card.scenes.length === spans.length
        ? card.scenes[index].targetChars
        : targetChars / spans.length,
    )
  const total = draftCharCount(text)
  const picked = spans
    .map((_, index) => ({ index, text: spanText(index), share: shareOf(index) }))
    .filter((item) => draftCharCount(item.text) < item.share * pass.pickRatio)
    .sort((a, b) => draftCharCount(a.text) / a.share - draftCharCount(b.text) / b.share)
    .slice(0, MAX_EXPAND_SPANS)
  if (picked.length === 0) return { text, accepted: 0, warnings: [] }

  // Expansions are sub-runs of this draft, which already passed the run cap. They run in a small
  // pool, and the clock is read again before each span starts. `skipped` covers a span that never
  // started (no time left, or the author aborted): it keeps its text and records no warning.
  const settled: ExpandOutcome[] = picked.map(() => ({ status: 'skipped' }))
  let nextPicked = 0
  const worker = async (): Promise<void> => {
    while (nextPicked < picked.length) {
      const k = nextPicked
      nextPicked += 1
      if (signal?.aborted) return
      const left = Math.min(
        DRAFT_TOTAL_BUDGET_MS - (Date.now() - ctx.startedAt),
        STREAM_AI_TIMEOUT_MS,
      )
      // Time only runs out, so no later span can start either.
      if (left < MIN_CONTINUATION_MS) return
      const { index, text: scene, share } = picked[k]
      try {
        const before =
          index > 0
            ? splitParagraphs(spanText(index - 1))
                .slice(-2)
                .map((paragraph) => paragraph.text)
                .join('\n\n')
            : ''
        const after =
          index + 1 < spans.length ? (splitParagraphs(spanText(index + 1))[0]?.text ?? '') : ''
        const expansion = await startAiStream(
          db,
          { userId: actor.userId, workId, chapterId, signal, timeoutMs: left, subRun: true },
          {
            task: 'draft-expand',
            input: { instructions: promptInput.instructions },
            effort: EXPAND_EFFORT,
            maxTokens: EXPAND_MAX_TOKENS,
            system: DRAFT_EXPAND_SYSTEM,
            prompt: buildExpandPrompt({
              before,
              scene,
              after,
              targetChars: pass.ask({ length: draftCharCount(scene), share }, total, picked.length),
              styleCards: promptInput.styleCards,
              instructions: promptInput.instructions,
            }),
          },
          client,
        )
        settled[k] = { status: 'fulfilled', value: unwrapExpansion(await expansion.done) }
      } catch (reason) {
        settled[k] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(EXPAND_CONCURRENCY, picked.length) }, () => worker()),
  )

  // An abort rejects whatever else happened, so nothing half-spliced is stored.
  if (signal?.aborted) {
    const failed = settled.find(
      (item): item is Extract<ExpandOutcome, { status: 'rejected' }> => item.status === 'rejected',
    )
    const error = failed ? failed.reason : signal.reason
    pipe.fail(error)
    throw error
  }

  const replacements: { span: SceneRange; text: string }[] = []
  const warnings: DraftWarning[] = []
  settled.forEach((outcome, k) => {
    const { index, text: scene } = picked[k]
    if (outcome.status === 'skipped') return
    if (outcome.status === 'rejected') {
      const error = outcome.reason
      const detail = isAppError(error)
        ? error.code
        : error instanceof Error
          ? error.message
          : String(error)
      warnings.push(continueFailedWarning('EXPAND_ERROR', detail))
    } else {
      const rejection = expansionRejection(scene, outcome.value)
      if (rejection === null) {
        replacements.push({ span: spans[index], text: outcome.value })
      } else {
        // The check name goes in front of the rewrite, so the warning says why it was refused.
        const detail = `${rejection}: ${outcome.value.slice(0, REJECTED_PREVIEW_CHARS)}`
        warnings.push(continueFailedWarning('EXPAND_REJECTED', detail, detail.length))
      }
    }
  })

  if (replacements.length === 0) return { text, accepted: 0, warnings }
  return { text: spliceSpans(text, replacements), accepted: replacements.length, warnings }
}

/**
 * Writes a plan card one scene per call (`scenes` mode). The first scene is the draft run; each later
 * scene is its own `draft-scene` run, streamed to `pipe` as it arrives. A later scene that fails or
 * has too little time left ends the draft: the text written so far is kept, with a SCENES_CUT
 * warning. An empty first scene ends it too, with scenesWritten 0 and no text. Only a user abort
 * rejects. Stored and streamed text are the same.
 */
async function completeScenes(
  ctx: DraftContext,
  first: { runId: string; textStream: AsyncIterable<string>; done: Promise<string> },
  pipe: TextPipe,
  card: DraftPlanCard,
): Promise<string> {
  const { db, actor, workId, chapterId, promptInput, client, signal } = ctx
  // Everything pushed to the pipe so far. It is what gets stored.
  const written = { text: '' }
  try {
    await streamScene(first.textStream, pipe, written, '')
    await first.done
  } catch (error) {
    pipe.fail(error)
    throw error
  }

  let scenesWritten = 1
  let cut = false
  // An empty first scene leaves no opening to build on, so no later scene is written.
  if (written.text === '') {
    cut = true
    scenesWritten = 0
  }
  for (let index = 1; index < card.scenes.length && !cut; index++) {
    const remaining = Math.min(
      DRAFT_TOTAL_BUDGET_MS - (Date.now() - ctx.startedAt),
      STREAM_AI_TIMEOUT_MS,
    )
    // The abort check comes first, so an abort still rejects below instead of skipping.
    if (!signal?.aborted && remaining < MIN_CONTINUATION_MS) {
      cut = true
      break
    }
    const before = written.text.length
    try {
      const scene = await startAiStream(
        db,
        { userId: actor.userId, workId, chapterId, signal, timeoutMs: remaining },
        {
          task: 'draft-scene',
          input: { instructions: promptInput.instructions },
          effort: DRAFT_EFFORT,
          maxTokens: DRAFT_MAX_TOKENS,
          system: DRAFT_SYSTEM,
          prompt: buildScenePrompt(promptInput, card, index, written.text),
        },
        client,
      )
      await streamScene(scene.textStream, pipe, written, SCENE_SEPARATOR)
      await scene.done
    } catch (error) {
      if (signal?.aborted) {
        pipe.fail(error)
        throw error
      }
      cut = true
      break
    }
    // A scene that wrote nothing is a failed scene.
    if (written.text.length === before) {
      cut = true
      break
    }
    scenesWritten = index + 1
  }

  try {
    await replaceRunOutput(
      db,
      first.runId,
      cut
        ? { text: written.text, warnings: [{ code: 'SCENES_CUT', scenesWritten }] }
        : { text: written.text },
    )
  } catch (error) {
    pipe.fail(error)
    throw error
  }
  pipe.end()
  return written.text
}

/**
 * Passes one scene's chunks on to `pipe` as they arrive and appends them to `written`. Blank lines
 * and break lines at the start and end of the scene are dropped, because code writes the break
 * between scenes. `joint` goes out with the first kept text, so a scene that yields nothing adds
 * nothing to the text.
 */
async function streamScene(
  source: AsyncIterable<string>,
  pipe: TextPipe,
  written: { text: string },
  joint: string,
): Promise<void> {
  const edges = createSceneEdgeFilter()
  let started = false
  const send = (piece: string): void => {
    if (piece === '') return
    const out = (started ? '' : joint) + piece
    started = true
    written.text += out
    pipe.push(out)
  }
  for await (const chunk of source) send(edges.push(stripStreamMarks(chunk)))
  send(edges.end())
}

/**
 * Adds the approved card and its plan run id to a finished draft run. The other keys of the output
 * (text, warnings) are kept as they are.
 */
async function keepPlanInRun(
  db: Db,
  runId: string,
  card: DraftPlanCard,
  planRunId: string | undefined,
): Promise<void> {
  const [row] = await db
    .select({ output: aiRuns.output })
    .from(aiRuns)
    .where(eq(aiRuns.id, runId))
    .limit(1)
  const output = row?.output && typeof row.output === 'object' ? row.output : {}
  await replaceRunOutput(db, runId, { ...output, plan: card, planRunId: planRunId ?? null })
}

/** Keeps the first text in the first run row with the warnings. Best effort: never throws. */
async function recordWarnings(
  db: Db,
  runId: string,
  firstText: string,
  warnings: DraftWarning[],
): Promise<void> {
  try {
    await replaceRunOutput(db, runId, { text: firstText, warnings })
  } catch {
    // A failed warning write must not lose the first text, so it is ignored.
  }
}

/**
 * Creates a new chapter from a finished draft run, with version source ai_draft. Only the
 * run's own author in the same work can use it. Editor role.
 */
export async function createChapterFromDraft(
  db: Db,
  actor: Actor,
  input: {
    workId: string
    runId: string
    title?: string
    /**
     * Text to save instead of the run's stored text. For the eval and server callers only: the
     * action wrapper does not accept it, so a client of the app can only save the stored text.
     */
    body?: string
  },
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
  if (input.body !== undefined && input.body.trim() === '') {
    throw new AppError('VALIDATION', '본문이 비어 있습니다.')
  }
  const chapter = await createChapter(db, actor, {
    workId: input.workId,
    title: input.title,
    body: input.body ?? text,
    versionSource: 'ai_draft',
  })
  try {
    await recordUsageEvent(db, actor, {
      workId: input.workId,
      chapterId: chapter.id,
      runId: input.runId,
      kind: 'draft_used',
      value: text.length,
      extra: { mode: 0, priorChars: 0 },
    })
    // The unedited chapter is the best case for the edit ratio, so it gets its row now.
    await updateDraftEditRatio(db, input.workId, chapter.id, chapter.body)
  } catch (error) {
    console.warn('usage event draft_used failed', error)
  }
  return chapter
}

export type RepairDraftResult = { runId: string; text: string; flagged: number; applied: number }

/**
 * Rewrites only the flagged sentences of a finished draft run (spec 6, 7). It runs after the
 * draft is done, never inside the stream, and updates the run row only: the manuscript and the
 * chapter are not changed. `input.text` repairs that text instead of the stored one. Editor role.
 */
export async function repairDraft(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; lang?: 'ko' | 'en'; text?: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<RepairDraftResult> {
  const { workId, runId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  if (
    !run ||
    run.workId !== workId ||
    run.userId !== actor.userId ||
    run.task !== 'draft-chapter'
  ) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (run.status !== 'done') {
    throw new AppError('BAD_STATE', '초안 작성이 끝난 뒤에 다듬을 수 있습니다.')
  }
  const stored = draftText(run.output)
  if (stored === null) throw new AppError('BAD_STATE', '저장된 초안을 읽을 수 없습니다.')

  // Idempotent: a repaired run keeps its result, so a second call makes no AI call.
  const output = run.output as Record<string, unknown>
  const previous = (output.repair ?? null) as { flagged: number; applied: number } | null
  if (previous) {
    return { runId, text: stored, flagged: previous.flagged, applied: previous.applied }
  }

  const text = input.text ?? stored
  const examples = (await listStyleCards(db, actor, workId))
    .map((card) => card.examples)
    .filter((example) => example.trim() !== '')
  const exempt = (await listEntries(db, actor, workId)).flatMap((entry) => [
    entry.name,
    ...entry.aliases,
  ])
  const flags = findDraftFlags(text, { examples, exempt, lang: input.lang })
  if (flags.length === 0) {
    const repair = { flagged: 0, applied: 0 }
    await replaceRunOutput(db, runId, { ...output, text, repair })
    return { runId, text, ...repair }
  }

  const { output: edits } = await runAiTask(
    db,
    { userId: actor.userId, workId, chapterId: run.chapterId, signal },
    draftRepairTask,
    { text, flags },
    client,
  )
  throwIfCancelled(signal)
  const repaired = applyDraftEdits(text, flags, edits.edits)
  const repair = { flagged: flags.length, applied: repaired.applied }
  await replaceRunOutput(db, runId, {
    ...output,
    text: repaired.text,
    originalText: text,
    repair,
  })
  return { runId, text: repaired.text, ...repair }
}

/**
 * Rewrites only the sentences with foreign script (Han, kana, Cyrillic, U+FFFD) in a finished draft
 * (spec 6, 7). Eval only: the product does not call it. Each round sends the sentences that still
 * have foreign script to draft-repair, and applyDraftEdits keeps the change inside them. The run row
 * is rewritten only when the text changed, and keeps the first raw draft in `rawText`. A failed
 * round throws and writes nothing. `input.text` repairs that text instead of the stored one. Editor role.
 */
export async function repairDraftForeignScript(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; text?: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ text: string; replaced: number; unresolved: ForeignSpan[] }> {
  const { workId, runId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  if (
    !run ||
    run.workId !== workId ||
    run.userId !== actor.userId ||
    run.task !== 'draft-chapter'
  ) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (run.status !== 'done') {
    throw new AppError('BAD_STATE', '초안 작성이 끝난 뒤에 고칠 수 있습니다.')
  }
  const stored = draftText(run.output)
  if (stored === null) throw new AppError('BAD_STATE', '저장된 초안을 읽을 수 없습니다.')
  const output = run.output as Record<string, unknown>
  // A repaired run keeps the draft it had before the first repair.
  const storedRaw = typeof output.rawText === 'string' ? output.rawText : null

  let text = input.text ?? stored
  if (repairableForeignSpans(text).length === 0) return { text, replaced: 0, unresolved: [] }

  let replaced = 0
  for (let round = 1; round <= MAX_REPAIR_ROUNDS; round++) {
    const spans = repairableForeignSpans(text)
    if (spans.length === 0) break
    const sentences = splitSentences(text)
    const flags: DraftFlag[] = []
    for (const span of spans) {
      const sentence = sentenceIn(sentences, span.start)
      if (flags.some((flag) => flag.start === sentence.start)) continue
      flags.push({
        kind: 'foreign-script',
        start: sentence.start,
        end: sentence.end,
        quote: sentence.text,
        reason: '한글이 아닌 글자가 섞여 있다.',
      })
    }
    const batch = flags.slice(0, MAX_REPAIR_SENTENCES)
    const { output: edits } = await runAiTask(
      db,
      { userId: actor.userId, workId, chapterId: run.chapterId, signal },
      draftRepairTask,
      { text, flags: batch },
      client,
    )
    throwIfCancelled(signal)
    const applied = applyDraftEdits(text, batch, edits.edits)
    text = applied.text
    replaced += applied.applied
  }

  if (text !== stored) {
    await replaceRunOutput(db, runId, { ...output, text, rawText: storedRaw ?? stored })
  }
  return { text, replaced, unresolved: repairableForeignSpans(text) }
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
