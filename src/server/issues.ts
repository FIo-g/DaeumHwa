import { and, count, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { issues } from '@/db/schema'
import type { Actor, IssueKind, IssueRow, IssueStatus, Severity } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'

// Issues are findings on a chapter's text (spec F7, F14). AI continuity checks and the
// deterministic spelling pass write them; the author resolves them. Issues are not wiki rows,
// so they are hard-deleted when a new check replaces the open ones.

export type NewIssue = {
  kind: IssueKind
  severity: Severity
  quote: string
  quoteStart: number | null
  quoteEnd: number | null
  entryId: string | null
  factId: string | null
  wikiExcerpt: string
  explanation: string
  suggestion: string
}

export type ResolveStatus = Exclude<IssueStatus, 'open'>

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

/**
 * Replaces the open issues of one chapter with a new set. Resolved issues are kept as history.
 * No access check here: callers check the work role first.
 */
export async function replaceOpenIssues(
  db: Db,
  input: { workId: string; chapterId: string; runId: string | null; issues: NewIssue[] },
): Promise<IssueRow[]> {
  return db.transaction(async (tx) => {
    await tx
      .delete(issues)
      .where(
        and(
          eq(issues.workId, input.workId),
          eq(issues.chapterId, input.chapterId),
          eq(issues.status, 'open'),
        ),
      )
    if (input.issues.length === 0) return []
    return tx
      .insert(issues)
      .values(
        input.issues.map((issue) => ({
          workId: input.workId,
          chapterId: input.chapterId,
          runId: input.runId,
          kind: issue.kind,
          severity: issue.severity,
          quote: issue.quote,
          quoteStart: issue.quoteStart,
          quoteEnd: issue.quoteEnd,
          entryId: issue.entryId,
          factId: issue.factId,
          wikiExcerpt: issue.wikiExcerpt,
          explanation: issue.explanation,
          suggestion: issue.suggestion,
        })),
      )
      .returning()
  })
}

/** Issues of one chapter, most severe first, then in text order. Viewer role or higher. */
export async function listIssues(
  db: Db,
  actor: Actor,
  chapterId: string,
  o?: { statuses?: IssueStatus[] },
): Promise<IssueRow[]> {
  const workId = await requireRowWork(db, 'chapters', chapterId)
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  if (o?.statuses && o.statuses.length === 0) return []
  const conditions = [eq(issues.chapterId, chapterId)]
  if (o?.statuses) conditions.push(inArray(issues.status, o.statuses))
  const rows = await db
    .select()
    .from(issues)
    .where(and(...conditions))
  return rows.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    const aStart = a.quoteStart ?? Number.MAX_SAFE_INTEGER
    const bStart = b.quoteStart ?? Number.MAX_SAFE_INTEGER
    if (aStart !== bStart) return aStart - bStart
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/** Marks an open issue as handled. Editor role. Resolving an issue twice is BAD_STATE. */
export async function resolveIssue(
  db: Db,
  actor: Actor,
  input: { issueId: string; status: ResolveStatus },
): Promise<IssueRow> {
  const workId = await requireRowWork(db, 'issues', input.issueId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [current] = await db.select().from(issues).where(eq(issues.id, input.issueId)).limit(1)
  if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  if (current.status !== 'open') throw new AppError('BAD_STATE', '이미 처리된 지적입니다.')
  const [updated] = await db
    .update(issues)
    .set({ status: input.status, resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(eq(issues.id, input.issueId))
    .returning()
  return updated
}

/** Puts a resolved issue back to open. Editor role. An open issue is returned unchanged. */
export async function reopenIssue(db: Db, actor: Actor, issueId: string): Promise<IssueRow> {
  const workId = await requireRowWork(db, 'issues', issueId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [current] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1)
  if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  if (current.status === 'open') return current
  const [updated] = await db
    .update(issues)
    .set({ status: 'open', resolvedBy: null, resolvedAt: null })
    .where(eq(issues.id, issueId))
    .returning()
  return updated
}

/** Number of open issues in a work. The caller checks access (used by page queries). */
export async function countOpenIssues(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(issues)
    .where(and(eq(issues.workId, workId), eq(issues.status, 'open')))
  return row?.value ?? 0
}
