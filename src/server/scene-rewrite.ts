// Scene rewrite service (spec 7, brief D). Rewrites only the scene around each author-accepted
// high-severity continuity issue, then saves the chapter. Everything outside the rewritten scenes
// stays byte-identical. No route or UI calls this yet: the eval harness is its only caller.

import { and, eq, inArray } from 'drizzle-orm'
import { runAiTask } from '@/ai/run'
import type { AiClient } from '@/ai/types'
import { isAcceptableRewrite, type SceneFinding, sceneRewriteTask } from '@/ai/tasks/scene-rewrite'
import type { Db } from '@/db/client'
import { issues } from '@/db/schema'
import type { Actor, ChapterRow, IssueRow } from '@/db/types'
import { type SceneRange, sceneRangeAt } from '@/lib/scene'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { getChapter, saveChapter } from '@/server/chapters'

/** Scenes rewritten per call, in story order. The rest are skipped as over-limit. */
const DEFAULT_MAX_SCENES = 2

export type SkipReason =
  | 'not-found'
  | 'not-accepted'
  | 'no-suggestion'
  | 'no-span'
  | 'span-mismatch'
  | 'no-scene'
  | 'over-limit'
  | 'rejected'

export type RewrittenScene = { issueIds: string[]; start: number; end: number; runId: string }

export type RewriteFlaggedScenesInput = {
  chapterId: string
  issueIds: string[]
  maxScenes?: number
  beats?: string | null
}

/** One scene with the issues that point into it. */
type SceneGroup = { start: number; end: number; issues: IssueRow[] }

/**
 * Rewrites the scenes of the given issues and saves the chapter once. Only issues the author has
 * accepted are used, so the service checks validity itself and does not trust the caller. An AI
 * error propagates; a rewrite that fails the quote check is skipped and the body is left alone.
 */
export async function rewriteFlaggedScenes(
  db: Db,
  actor: Actor,
  input: RewriteFlaggedScenesInput,
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{
  chapter: ChapterRow
  rewritten: RewrittenScene[]
  skipped: { issueId: string; reason: SkipReason }[]
}> {
  const workId = await requireRowWork(db, 'chapters', input.chapterId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const chapter = await getChapter(db, actor, input.chapterId)
  if (input.issueIds.length === 0) return { chapter, rewritten: [], skipped: [] }

  const body = chapter.body
  const skipped: { issueId: string; reason: SkipReason }[] = []
  const rows = await db
    .select()
    .from(issues)
    .where(and(inArray(issues.id, [...new Set(input.issueIds)]), eq(issues.chapterId, chapter.id)))
  const byId = new Map(rows.map((row) => [row.id, row]))

  const scenes: { issue: IssueRow; scene: SceneRange }[] = []
  for (const issueId of new Set(input.issueIds)) {
    const issue = byId.get(issueId)
    if (!issue) {
      skipped.push({ issueId, reason: 'not-found' })
      continue
    }
    const span = issueSpan(issue, body)
    if (typeof span === 'string') {
      skipped.push({ issueId, reason: span })
      continue
    }
    const scene = sceneRangeAt(body, span.start, span.end)
    if (!scene) skipped.push({ issueId, reason: 'no-scene' })
    else scenes.push({ issue, scene })
  }

  const groups = groupScenes(scenes)
  const maxScenes = input.maxScenes ?? DEFAULT_MAX_SCENES
  const rewritten: RewrittenScene[] = []
  const replacements: { start: number; end: number; text: string }[] = []
  for (const [index, group] of groups.entries()) {
    if (index >= maxScenes) {
      for (const issue of group.issues) skipped.push({ issueId: issue.id, reason: 'over-limit' })
      continue
    }
    const sceneText = body.slice(group.start, group.end)
    const findings = group.issues.map(toFinding)
    const { output, runId } = await runAiTask(
      db,
      { userId: actor.userId, workId, chapterId: chapter.id, signal },
      sceneRewriteTask,
      { sceneText, findings, beats: input.beats ?? null },
      client,
    )
    const quotes = findings.map((finding) => finding.quote)
    if (!isAcceptableRewrite(sceneText, output.text, quotes)) {
      for (const issue of group.issues) skipped.push({ issueId: issue.id, reason: 'rejected' })
      continue
    }
    replacements.push({ start: group.start, end: group.end, text: output.text.trim() })
    rewritten.push({
      issueIds: group.issues.map((issue) => issue.id),
      start: group.start,
      end: group.end,
      runId,
    })
  }

  if (replacements.length === 0) return { chapter, rewritten, skipped }
  // Applied from the last scene to the first, so the earlier offsets stay valid.
  let next = body
  for (const edit of [...replacements].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }
  if (next === body) return { chapter, rewritten, skipped }
  // expectedVersion makes a save made elsewhere since getChapter fail with CONFLICT, so no edit is lost.
  const saved = await saveChapter(db, actor, {
    chapterId: chapter.id,
    body: next,
    expectedVersion: chapter.version,
    keepHistory: true,
  })
  return { chapter: saved, rewritten, skipped }
}

/**
 * The quoted span of an issue in the saved body, or the reason it cannot be rewritten. Checked in
 * this order. Only an accepted issue (the author's decision) with a suggestion is rewritten.
 */
function issueSpan(issue: IssueRow, body: string): { start: number; end: number } | SkipReason {
  if (issue.status !== 'accepted') return 'not-accepted'
  if (issue.suggestion.trim() === '') return 'no-suggestion'
  const { quoteStart: start, quoteEnd: end } = issue
  if (start === null || end === null) return 'no-span'
  if (body.slice(start, end) !== issue.quote) return 'span-mismatch'
  return { start, end }
}

/** Sorts the issues by scene and merges scenes that overlap (window ranges can). */
function groupScenes(scenes: { issue: IssueRow; scene: SceneRange }[]): SceneGroup[] {
  const sorted = [...scenes].sort((a, b) => a.scene.start - b.scene.start)
  const groups: SceneGroup[] = []
  for (const { issue, scene } of sorted) {
    const last = groups.at(-1)
    if (last && scene.start < last.end) {
      last.end = Math.max(last.end, scene.end)
      last.issues.push(issue)
    } else {
      groups.push({ start: scene.start, end: scene.end, issues: [issue] })
    }
  }
  return groups
}

function toFinding(issue: IssueRow): SceneFinding {
  return {
    quote: issue.quote,
    explanation: issue.explanation,
    wikiExcerpt: issue.wikiExcerpt,
    suggestion: issue.suggestion,
  }
}
