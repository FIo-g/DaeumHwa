import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { buttonVariants } from '@/components/ui/button'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import { formatKoreanDateTime } from '@/lib/dates'
import { ReaderSimResultCard } from './reader-sim-result'

export type ReaderSimRunView = {
  id: string
  /** ISO timestamp of the run. */
  createdAt: string
  result: ReaderSimResult
}

export type ReaderSimChapterGroup = {
  key: string
  chapterTitle: string
  /** Link to the chapter's writing screen. Null when the chapter is gone. */
  chapterHref: string | null
  /** Runs for this chapter, newest first. */
  runs: ReaderSimRunView[]
}

type ReaderSimListProps = {
  groups: ReaderSimChapterGroup[]
  /** Persona id to display name. Unknown ids show the raw id. */
  personaNames: Record<string, string>
}

/** Reader simulation results grouped by chapter, latest chapter first. */
export function ReaderSimList({ groups, personaNames }: ReaderSimListProps) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title="아직 독자 시뮬레이션 결과가 없습니다."
        description="집필 화면의 '독자 반응' 탭에서 독자 시뮬레이션을 실행할 수 있습니다."
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.chapterTitle} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{group.chapterTitle}</h2>
            {group.chapterHref && (
              <Link
                href={group.chapterHref}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                회차 열기
              </Link>
            )}
          </div>
          {group.runs.map((run) => (
            <RunCard key={run.id} run={run} personaNames={personaNames} />
          ))}
        </section>
      ))}
    </div>
  )
}

function RunCard({
  run,
  personaNames,
}: {
  run: ReaderSimRunView
  personaNames: Record<string, string>
}) {
  const personas = run.result.personas
  const average =
    personas.length === 0 ? 0 : personas.reduce((sum, p) => sum + p.rating, 0) / personas.length

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">{formatKoreanDateTime(run.createdAt)}</span>
        <span>{`평균 ★ ${average.toFixed(1)}`}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {personas.map((persona) => (
          <ReaderSimResultCard
            key={persona.personaId}
            name={personaNames[persona.personaId] ?? persona.personaId}
            persona={persona}
          />
        ))}
      </div>
      {run.result.summary && (
        <p className="text-sm">
          <span className="font-medium">전체 요약 </span>
          {run.result.summary}
        </p>
      )}
    </div>
  )
}
