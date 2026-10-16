import { READER_PERSONAS } from '@/ai/personas'
import { PageHeader } from '@/components/app/page-header'
import {
  ReaderSimList,
  type ReaderSimChapterGroup,
  type ReaderSimRunView,
} from '@/components/reader-sim/reader-sim-list'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import { chapterLabel } from '@/lib/labels'
import { listChapters } from '@/server/chapters'
import { listReaderSimRuns } from '@/server/ai-features'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

export default async function ReaderSimPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/reader-sim`)
  await guardPage(() => getWork(db, actor, workId))
  const runs = await guardPage(() => listReaderSimRuns(db, actor, workId))
  const chapters = await guardPage(() => listChapters(db, actor, workId, { includeArchived: true }))

  const chapterById = new Map(chapters.map((c) => [c.id, c]))
  const groupMap = new Map<string, ReaderSimChapterGroup>()
  for (const run of runs) {
    if (!isReaderSimResult(run.output)) continue
    const key = run.chapterId ?? 'deleted'
    let group = groupMap.get(key)
    if (!group) {
      const chapter = run.chapterId ? chapterById.get(run.chapterId) : undefined
      group = {
        key,
        chapterTitle: chapter ? chapterLabel(chapter.position, chapter.title) : '삭제된 회차',
        chapterHref: chapter ? `/works/${workId}/chapters/${chapter.id}` : null,
        runs: [],
      }
      groupMap.set(key, group)
    }
    const view: ReaderSimRunView = {
      id: run.id,
      createdAt: new Date(run.createdAt).toISOString(),
      result: run.output,
    }
    group.runs.push(view)
  }

  const personaNames = Object.fromEntries(READER_PERSONAS.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="독자 시뮬레이션"
        description="회차마다 독자 페르소나가 남긴 반응을 모아 봅니다."
      />
      <ReaderSimList groups={[...groupMap.values()]} personaNames={personaNames} />
    </div>
  )
}

/** Stored run output is checked before it reaches the client. */
function isReaderSimResult(value: unknown): value is ReaderSimResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<ReaderSimResult>
  return Array.isArray(v.personas) && typeof v.summary === 'string'
}
