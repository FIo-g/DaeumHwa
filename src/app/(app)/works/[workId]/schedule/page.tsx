import { PageHeader } from '@/components/app/page-header'
import { ScheduleView } from '@/components/schedule/schedule-view'
import { seoulToday } from '@/lib/dates'
import { guardPage, pageContext } from '@/server/page-helpers'
import { hasRole } from '@/server/access'
import { getWork } from '@/server/works'
import { getScheduleInput, listScheduleItems } from '@/server/schedule'

export default async function SchedulePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/schedule`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const input = await guardPage(() => getScheduleInput(db, actor, workId))
  const items = await guardPage(() => listScheduleItems(db, actor, workId))

  return (
    <div className="flex flex-col">
      <PageHeader title="연재 일정" description="연재 요일과 비축 회차, 마감을 한눈에 봅니다." />
      <ScheduleView
        workId={workId}
        today={seoulToday()}
        canEdit={hasRole(work.role, 'editor')}
        isOwner={hasRole(work.role, 'owner')}
        input={input}
        items={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          date: item.date,
          endDate: item.endDate,
          chapterId: item.chapterId,
          note: item.note,
          done: item.done,
        }))}
      />
    </div>
  )
}
