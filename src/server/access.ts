import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  authorDirectives,
  changeLog,
  chapters,
  comments,
  facts,
  importJobs,
  interviewSessions,
  interviewTurns,
  issues,
  namingRules,
  proposals,
  relations,
  scheduleItems,
  styleCards,
  threadEvents,
  threads,
  wikiEntries,
  workInvites,
  workMembers,
} from '@/db/schema'
import type { Role } from '@/db/types'
import { AppError } from '@/lib/errors'

export const ROLE_RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }

export function hasRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RowTable =
  | 'chapters'
  | 'wiki_entries'
  | 'facts'
  | 'threads'
  | 'thread_events'
  | 'relations'
  | 'naming_rules'
  | 'style_cards'
  | 'author_directives'
  | 'proposals'
  | 'issues'
  | 'comments'
  | 'change_log'
  | 'import_jobs'
  | 'schedule_items'
  | 'interview_sessions'
  | 'interview_turns'
  | 'work_invites'

/** Returns the caller's membership in a work, or null when they are not a member. */
export async function getMembership(
  db: Db,
  workId: string,
  userId: string,
): Promise<{ role: Role } | null> {
  if (!UUID_RE.test(workId)) return null
  const [row] = await db
    .select({ role: workMembers.role })
    .from(workMembers)
    .where(and(eq(workMembers.workId, workId), eq(workMembers.userId, userId)))
    .limit(1)
  return row ? { role: row.role } : null
}

/**
 * Every service calls this first. Non-members (and unknown works) get NOT_FOUND so that
 * the existence of a work is never revealed. Members below `min` get FORBIDDEN.
 */
export async function requireWorkRole(
  db: Db,
  workId: string,
  userId: string,
  min: Role,
): Promise<{ role: Role }> {
  const membership = await getMembership(db, workId, userId)
  if (!membership) throw new AppError('NOT_FOUND', '작품을 찾을 수 없습니다.')
  if (!hasRole(membership.role, min)) {
    throw new AppError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
  }
  return membership
}

async function findWorkId(db: Db, table: RowTable, id: string): Promise<string | undefined> {
  switch (table) {
    case 'chapters': {
      const [r] = await db
        .select({ workId: chapters.workId })
        .from(chapters)
        .where(eq(chapters.id, id))
        .limit(1)
      return r?.workId
    }
    case 'wiki_entries': {
      const [r] = await db
        .select({ workId: wikiEntries.workId })
        .from(wikiEntries)
        .where(eq(wikiEntries.id, id))
        .limit(1)
      return r?.workId
    }
    case 'facts': {
      const [r] = await db
        .select({ workId: facts.workId })
        .from(facts)
        .where(eq(facts.id, id))
        .limit(1)
      return r?.workId
    }
    case 'threads': {
      const [r] = await db
        .select({ workId: threads.workId })
        .from(threads)
        .where(eq(threads.id, id))
        .limit(1)
      return r?.workId
    }
    case 'thread_events': {
      const [r] = await db
        .select({ workId: threads.workId })
        .from(threadEvents)
        .innerJoin(threads, eq(threads.id, threadEvents.threadId))
        .where(eq(threadEvents.id, id))
        .limit(1)
      return r?.workId
    }
    case 'relations': {
      const [r] = await db
        .select({ workId: relations.workId })
        .from(relations)
        .where(eq(relations.id, id))
        .limit(1)
      return r?.workId
    }
    case 'naming_rules': {
      const [r] = await db
        .select({ workId: namingRules.workId })
        .from(namingRules)
        .where(eq(namingRules.id, id))
        .limit(1)
      return r?.workId
    }
    case 'style_cards': {
      const [r] = await db
        .select({ workId: styleCards.workId })
        .from(styleCards)
        .where(eq(styleCards.id, id))
        .limit(1)
      return r?.workId
    }
    case 'author_directives': {
      const [r] = await db
        .select({ workId: authorDirectives.workId })
        .from(authorDirectives)
        .where(eq(authorDirectives.id, id))
        .limit(1)
      return r?.workId
    }
    case 'proposals': {
      const [r] = await db
        .select({ workId: proposals.workId })
        .from(proposals)
        .where(eq(proposals.id, id))
        .limit(1)
      return r?.workId
    }
    case 'issues': {
      const [r] = await db
        .select({ workId: issues.workId })
        .from(issues)
        .where(eq(issues.id, id))
        .limit(1)
      return r?.workId
    }
    case 'comments': {
      const [r] = await db
        .select({ workId: comments.workId })
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1)
      return r?.workId
    }
    case 'change_log': {
      const [r] = await db
        .select({ workId: changeLog.workId })
        .from(changeLog)
        .where(eq(changeLog.id, id))
        .limit(1)
      return r?.workId
    }
    case 'import_jobs': {
      const [r] = await db
        .select({ workId: importJobs.workId })
        .from(importJobs)
        .where(eq(importJobs.id, id))
        .limit(1)
      return r?.workId
    }
    case 'schedule_items': {
      const [r] = await db
        .select({ workId: scheduleItems.workId })
        .from(scheduleItems)
        .where(eq(scheduleItems.id, id))
        .limit(1)
      return r?.workId
    }
    case 'interview_sessions': {
      const [r] = await db
        .select({ workId: interviewSessions.workId })
        .from(interviewSessions)
        .where(eq(interviewSessions.id, id))
        .limit(1)
      return r?.workId
    }
    case 'interview_turns': {
      const [r] = await db
        .select({ workId: interviewSessions.workId })
        .from(interviewTurns)
        .innerJoin(interviewSessions, eq(interviewSessions.id, interviewTurns.sessionId))
        .where(eq(interviewTurns.id, id))
        .limit(1)
      return r?.workId
    }
    case 'work_invites': {
      const [r] = await db
        .select({ workId: workInvites.workId })
        .from(workInvites)
        .where(eq(workInvites.id, id))
        .limit(1)
      return r?.workId
    }
  }
}

/**
 * Resolves the work that owns a row (directly or through its parent).
 * Use it before requireWorkRole when the caller only has a row id.
 */
export async function requireRowWork(db: Db, table: RowTable, id: string): Promise<string> {
  const workId = UUID_RE.test(id) ? await findWorkId(db, table, id) : undefined
  if (!workId) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  return workId
}
