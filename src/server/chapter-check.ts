import { and, eq, isNull } from 'drizzle-orm'
import { buildContextPack, CONTINUITY_BUDGET_CHARS, resolveRefs } from '@/ai/context'
import { extractionToProposals } from '@/ai/extraction'
import { runAiTask, throwIfCancelled } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask, resolveContinuityIssues } from '@/ai/tasks/continuity-check'
import { type ProofreadKind, proofreadTask } from '@/ai/tasks/proofread'
import type { Db } from '@/db/client'
import { chapters, facts, proposals, relations } from '@/db/schema'
import type { Actor, ChapterRow, IssueRow, ProposalRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { normalizeProposalText } from '@/lib/proposal-payloads'
import { findNamingIssues } from '@/lib/korean/naming'
import { ruleBasedSpellcheck } from '@/lib/korean/spelling-rules'
import { locateAllQuotes, locateQuote, sentenceAt } from '@/lib/korean/sentences'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { type NewIssue, replaceOpenIssues } from '@/server/issues'
import { loadKnownEntries } from '@/server/known-entries'
import { listNamingRules } from '@/server/naming'
import { deletePendingProposals, insertProposals } from '@/server/proposal-store'

// Chapter check (F7) and proofreading (F14). Both are run by an editor from the writing screen.
// AI output becomes issues (replaced on each run) and post_chapter proposals (also replaced).
// Nothing here writes wiki rows.

export type ChapterCheckResult = {
  issues: IssueRow[]
  proposals: ProposalRow[]
  runIds: string[]
  namingIssueCount: number
}

export type ProofreadSuggestion = {
  source: 'rule' | 'ai'
  quote: string
  replacement: string
  kind: ProofreadKind
  reason: string
  start: number
  end: number
}

/** A proofreading source. The rule checker is always on; an AI checker runs when the author asks. */
export type SpellChecker = {
  id: string
  check(text: string): Promise<ProofreadSuggestion[]>
}

/** Longest text sent to the AI proofreader in one call. Longer text is rejected before any model call. */
export const MAX_PROOFREAD_AI_CHARS = 30_000

const RULE_KINDS: Record<string, ProofreadKind> = {
  andwae: 'spacing',
  lge: 'grammar',
  lgeol: 'grammar',
}

export const ruleSpellChecker: SpellChecker = {
  id: 'rule',
  async check(text) {
    return ruleBasedSpellcheck(text).map((s) => ({
      source: 'rule' as const,
      quote: s.quote,
      replacement: s.replacement,
      kind: RULE_KINDS[s.ruleId] ?? 'spelling',
      reason: s.reason,
      start: s.start,
      end: s.end,
    }))
  },
}

/**
 * Ranges where a model quote occurs. A quote of 2+ characters applies at every exact occurrence
 * (up to the locateAllQuotes limit). A shorter quote, or one only found after whitespace is
 * collapsed, maps to its first occurrence.
 */
function expandQuote(text: string, quote: string): { start: number; end: number }[] {
  if (quote.trim().length >= 2) {
    const all = locateAllQuotes(text, quote)
    if (all.length > 0) return all
  }
  const single = locateQuote(text, quote)
  return single ? [single] : []
}

/** Wraps the proofread task. `lastRunId` is the run of the most recent check call. */
function aiSpellChecker(
  db: Db,
  meta: { userId: string; workId: string; chapterId: string; signal?: AbortSignal },
  client: AiClient | undefined,
): SpellChecker & { lastRunId: () => string | null } {
  let runId: string | null = null
  return {
    id: 'ai',
    lastRunId: () => runId,
    async check(text) {
      const result = await runAiTask(db, meta, proofreadTask, { text }, client)
      runId = result.runId
      const suggestions: ProofreadSuggestion[] = []
      // Ranges already emitted. A later model item that overlaps one is dropped, so the
      // result follows model output order, not text position.
      const emitted: { start: number; end: number }[] = []
      for (const s of result.output.suggestions) {
        for (const range of expandQuote(text, s.quote)) {
          if (emitted.some((e) => range.start < e.end && e.start < range.end)) continue
          emitted.push(range)
          suggestions.push({
            source: 'ai',
            // Equals the model quote for exact matches; the manuscript text otherwise.
            quote: text.slice(range.start, range.end),
            replacement: s.replacement,
            kind: s.kind,
            reason: s.reason,
            start: range.start,
            end: range.end,
          })
        }
      }
      return suggestions
    },
  }
}

/** Loads a chapter for an editor. Non-members get NOT_FOUND, viewers FORBIDDEN, archived chapters NOT_FOUND. */
async function loadEditableChapter(
  db: Db,
  actor: Actor,
  chapterId: string,
): Promise<{ chapter: ChapterRow; workId: string }> {
  const workId = await requireRowWork(db, 'chapters', chapterId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1)
  if (!chapter || chapter.archivedAt !== null) {
    throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  }
  return { chapter, workId }
}

/**
 * Runs the chapter check on the saved chapter text: deterministic naming rules, the continuity
 * check and chapter extraction (in parallel). Replaces the chapter's open issues and the pending
 * post_chapter proposals; resolved issues are kept.
 */
export async function runChapterCheck(
  db: Db,
  actor: Actor,
  input: { chapterId: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<ChapterCheckResult> {
  const { chapter, workId } = await loadEditableChapter(db, actor, input.chapterId)
  const text = chapter.body
  // Stops the sibling call when the other one fails. The caller's cancel stops both.
  const sibling = new AbortController()
  const meta = {
    userId: actor.userId,
    workId,
    chapterId: chapter.id,
    signal: signal ? AbortSignal.any([signal, sibling.signal]) : sibling.signal,
  }

  const pack = await buildContextPack(db, workId, {
    text,
    position: chapter.position,
    keepNamed: true,
    budgetChars: CONTINUITY_BUDGET_CHARS,
  })
  const known = await loadKnownEntries(db, workId, { excludePostChapterOf: chapter.id })
  const rules = await listNamingRules(db, actor, workId)
  const relationRows = await db
    .select()
    .from(relations)
    .where(and(eq(relations.workId, workId), isNull(relations.archivedAt)))

  const knownFacts = pack.entries.flatMap((entry) =>
    entry.facts.map((fact) => ({ ref: fact.ref, subjectName: entry.name, content: fact.content })),
  )
  const openThreads = pack.threads.map((t) => ({
    ref: t.ref,
    title: t.title,
    description: t.description,
    status: t.status,
  }))

  // Both calls settle before anything is thrown, so each ai_runs row is finalized.
  const [continuityResult, extractResult] = await Promise.allSettled([
    runAiTask(
      db,
      meta,
      continuityCheckTask,
      { chapterText: text, chapterPosition: chapter.position, chapterTitle: chapter.title, pack },
      client,
    ).catch((error: unknown) => {
      sibling.abort()
      throw error
    }),
    runAiTask(
      db,
      meta,
      chapterExtractTask,
      {
        chapterText: text,
        chapterPosition: chapter.position,
        chapterTitle: chapter.title,
        known: [
          ...known.active.map((e) => ({
            name: e.name,
            kind: e.kind,
            aliases: e.aliases,
            pending: false,
          })),
          ...known.pending.map((e) => ({
            name: e.name,
            kind: e.kind,
            aliases: e.aliases,
            pending: true,
          })),
        ],
        openThreads,
        knownFacts,
      },
      client,
    ).catch((error: unknown) => {
      sibling.abort()
      throw error
    }),
  ])
  if (continuityResult.status === 'rejected' || extractResult.status === 'rejected') {
    throw firstFailure([continuityResult, extractResult])
  }
  const continuity = continuityResult.value
  const extract = extractResult.value

  const namingIssues = namingIssuesFor(text, rules)
  const aiIssues: NewIssue[] = resolveContinuityIssues(continuity.output, {
    chapterText: text,
    chapterPosition: chapter.position,
    chapterTitle: chapter.title,
    pack,
  }).map((issue) => ({
    kind: issue.kind,
    severity: issue.severity,
    quote: issue.quote,
    quoteStart: issue.start,
    quoteEnd: issue.end,
    entryId: issue.entryId,
    factId: issue.factId,
    wikiExcerpt: issue.wikiExcerpt,
    explanation: issue.explanation,
    suggestion: issue.suggestion,
  }))

  throwIfCancelled(signal)
  const issueRows = await replaceOpenIssues(db, {
    workId,
    chapterId: chapter.id,
    runId: continuity.runId,
    issues: [...namingIssues, ...aiIssues],
  })

  const { proposals: items } = extractionToProposals(extract.output, {
    source: 'post_chapter',
    sourceRef: extract.runId,
    chapterId: chapter.id,
    chapterPosition: chapter.position,
    existingEntries: known.active,
    pendingEntries: known.pending,
    pendingThreadCreateTitles: new Set(known.pendingThreadTitles),
    threadRefs: new Map(
      pack.threads.map((t) => [t.ref, { id: t.id, title: t.title, status: t.status }]),
    ),
    factRefs: new Map([...resolveRefs(pack).facts].map(([ref, fact]) => [ref, { id: fact.id }])),
    existingThreads: known.threads,
    existingRelations: relationRows.map((r) => ({
      sourceId: r.sourceEntryId,
      targetId: r.targetEntryId,
      kind: r.kind,
      directed: r.directed,
      endPosition: r.endPosition,
    })),
  })

  throwIfCancelled(signal)
  const proposalRows = await db.transaction(async (tx) => {
    await deletePendingProposals(tx, { workId, source: 'post_chapter', chapterId: chapter.id })
    // Facts already on a card (current ones only) and facts still waiting in the queue. The
    // chapter's own old post_chapter proposals were deleted above, so they cannot block a rerun.
    const existingFacts = await tx
      .select({ entryId: facts.entryId, content: facts.content })
      .from(facts)
      .where(
        and(
          eq(facts.workId, workId),
          isNull(facts.archivedAt),
          isNull(facts.supersededByFactId),
          isNull(facts.validToPosition),
        ),
      )
    const pendingFacts = await tx
      .select({ payload: proposals.payload })
      .from(proposals)
      .where(
        and(
          eq(proposals.workId, workId),
          eq(proposals.status, 'pending'),
          eq(proposals.type, 'fact_create'),
        ),
      )
    const existingKeys = new Set([
      ...existingFacts
        .filter((f) => f.entryId !== null)
        .map((f) => `${f.entryId}|${normalizeProposalText(f.content)}`),
      ...pendingFacts.flatMap(({ payload }) => {
        const p = payload as { entryId?: string | null; content?: string }
        return p.entryId && p.content ? [`${p.entryId}|${normalizeProposalText(p.content)}`] : []
      }),
    ])
    const fresh = items.filter(
      (item) =>
        !(
          item.type === 'fact_create' &&
          item.payload.entryId !== null &&
          existingKeys.has(`${item.payload.entryId}|${normalizeProposalText(item.payload.content)}`)
        ),
    )
    return insertProposals(tx, workId, fresh)
  })

  return {
    issues: issueRows,
    proposals: proposalRows,
    runIds: [continuity.runId, extract.runId],
    namingIssueCount: namingIssues.length,
  }
}

/**
 * The error to report when a parallel AI call failed: the first failure that is not a cancel,
 * so the cancel caused by the sibling's failure does not hide the real one.
 */
function firstFailure(results: PromiseSettledResult<unknown>[]): unknown {
  const reasons = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
  return (
    reasons.find((reason) => !(reason instanceof AppError && reason.code === 'CANCELLED')) ??
    reasons[0]
  )
}

/** Naming hits as low-severity issues. The quote is the whole sentence, with a suggestion that swaps the variant. */
function namingIssuesFor(
  text: string,
  rules: { id: string; canonical: string; variants: string[]; entryId: string | null }[],
): NewIssue[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const hits = findNamingIssues(text, rules)
  return hits.map((hit): NewIssue => {
    const sentence = sentenceAt(text, hit.start)
    const rule = ruleById.get(hit.ruleId)
    return {
      kind: 'naming',
      severity: 'low',
      quote: sentence.text,
      quoteStart: sentence.start,
      quoteEnd: sentence.end,
      entryId: rule?.entryId ?? null,
      factId: null,
      wikiExcerpt: `표기 규칙: ${hit.canonical}`,
      explanation: `'${hit.variant}'는 '${hit.canonical}'로 통일하기로 한 표기입니다.`,
      suggestion:
        text.slice(sentence.start, hit.start) + hit.canonical + text.slice(hit.end, sentence.end),
    }
  })
}

/**
 * Proofreading: the rule checker always runs; the AI checker runs when `useAi` is set. AI
 * suggestions that overlap a rule suggestion are dropped. Result is sorted by offset.
 */
export async function runProofread(
  db: Db,
  actor: Actor,
  input: { chapterId: string; text?: string; useAi: boolean },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ suggestions: ProofreadSuggestion[]; runId: string | null }> {
  const { chapter, workId } = await loadEditableChapter(db, actor, input.chapterId)
  const text = input.text ?? chapter.body
  if (input.useAi && text.length > MAX_PROOFREAD_AI_CHARS) {
    throw new AppError(
      'VALIDATION',
      `교정할 원고가 너무 깁니다. ${MAX_PROOFREAD_AI_CHARS / 10_000}만 자 이하로 나누어 교정해 주세요.`,
    )
  }

  const ruleSuggestions = await ruleSpellChecker.check(text)
  const ai = input.useAi
    ? aiSpellChecker(db, { userId: actor.userId, workId, chapterId: chapter.id, signal }, client)
    : null
  const aiSuggestions = ai ? await ai.check(text) : []

  const kept = aiSuggestions.filter(
    (s) => !ruleSuggestions.some((r) => s.start < r.end && r.start < s.end),
  )
  const suggestions = [...ruleSuggestions, ...kept].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )
  return { suggestions, runId: ai?.lastRunId() ?? null }
}
