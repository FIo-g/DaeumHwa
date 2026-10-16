import { PageHeader } from '@/components/app/page-header'
import { ThreadBoard } from '@/components/threads/thread-board'
import type { ThreadItem } from '@/components/threads/thread-types'
import { listChapters } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getThread, listThreads } from '@/server/threads'
import { getWork } from '@/server/works'
import { listEntries } from '@/server/wiki'

// 떡밥 장부 (F4): one column per thread status, with each thread's timeline loaded for its dialog.
export default async function ThreadsPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/wiki/threads`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const [views, chapters, entries] = await guardPage(() =>
    Promise.all([
      listThreads(db, actor, workId),
      listChapters(db, actor, workId),
      listEntries(db, actor, workId),
    ]),
  )
  const details = await guardPage(() =>
    Promise.all(views.map((view) => getThread(db, actor, view.id))),
  )

  const threads: ThreadItem[] = details.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    status: d.status,
    importance: d.importance,
    plantedChapterId: d.plantedChapterId,
    plantedPosition: d.plantedPosition,
    targetChapterPosition: d.targetChapterPosition,
    overdue: d.overdue,
    relatedEntries: d.relatedEntries,
    events: d.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      chapterId: e.chapterId,
      chapterPosition: e.chapterPosition,
      chapterTitle: e.chapterTitle,
      note: e.note,
      evidence: e.evidence,
    })),
  }))

  return (
    <div className="flex flex-col">
      <PageHeader title="떡밥 장부" description="심은 떡밥과 회수 기록을 상태별로 봅니다." />
      <ThreadBoard
        workId={workId}
        role={work.role}
        threads={threads}
        chapters={chapters.map((c) => ({ id: c.id, position: c.position, title: c.title }))}
        entries={entries.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
      />
    </div>
  )
}
