import type { Db } from '@/db/client'
import { type Actor, resolveWorkSettings } from '@/db/types'
import type { WritingData } from '@/components/writing/types'
import { AppError } from '@/lib/errors'
import { getChapter, listChapters } from '@/server/chapters'
import { listComments } from '@/server/comments'
import { listIssues } from '@/server/issues'
import { listNamingRules } from '@/server/naming'
import { countPendingProposals } from '@/server/proposal-store'
import { listThreads } from '@/server/threads'
import { listEntries } from '@/server/wiki'
import { getWork } from '@/server/works'

/**
 * Everything the writing screen shows, loaded through the services. A chapter that belongs to
 * another work than the URL is NOT_FOUND, like any other id the caller cannot see.
 */
export async function loadWritingData(
  db: Db,
  actor: Actor,
  workId: string,
  chapterId: string,
): Promise<WritingData> {
  const work = await getWork(db, actor, workId)
  const chapter = await getChapter(db, actor, chapterId)
  if (chapter.workId !== workId) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')

  const [chapters, entries, namingRules, threads, issues, comments, pendingProposalCount] =
    await Promise.all([
      listChapters(db, actor, workId),
      listEntries(db, actor, workId),
      listNamingRules(db, actor, workId),
      listThreads(db, actor, workId),
      listIssues(db, actor, chapterId, { statuses: ['open'] }),
      listComments(db, actor, chapterId),
      countPendingProposals(db, workId),
    ])

  // An archived chapter is not in the list, but the screen still has to show it.
  const chapterOptions = chapters.map((c) => ({ id: c.id, position: c.position, title: c.title }))
  if (chapter.archivedAt) {
    chapterOptions.push({ id: chapter.id, position: chapter.position, title: chapter.title })
    chapterOptions.sort((a, b) => a.position - b.position)
  }

  return {
    workId,
    workTitle: work.title,
    role: work.role,
    targetChars: resolveWorkSettings(work.settings).targetChars,
    chapter,
    chapters: chapterOptions,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      summary: e.summary,
    })),
    namingRules: namingRules.map((r) => ({
      id: r.id,
      canonical: r.canonical,
      variants: r.variants,
    })),
    threads,
    issues,
    comments,
    pendingProposalCount,
  }
}
