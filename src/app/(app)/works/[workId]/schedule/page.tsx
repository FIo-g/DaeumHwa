import { PageHeader } from '@/components/app/page-header'
import { ScheduleView } from '@/components/schedule/schedule-view'
import { seoulToday } from '@/lib/dates'
import { guardPage, pageContext } from '@/server/page-helpers'
import { hasRole } from '@/server/access'
import { getPeriodicAlerts } from '@/server/alerts'
import { getWork } from '@/server/works'
import { getScheduleInput, listScheduleItems } from '@/server/schedule'

export default async function SchedulePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/schedule`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const today = seoulToday()
  const [input, items, alerts] = await Promise.all([
    guardPage(() => getScheduleInput(db, actor, workId)),
    guardPage(() => listScheduleItems(db, actor, workId)),
    getPeriodicAlerts(db, workId, today),
  ])

  return (
    <div className="flex flex-col">
      <PageHeader title="연재 일정" />
      <ScheduleView
        workId={workId}
        today={today}
        alertCount={alerts.total}
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
