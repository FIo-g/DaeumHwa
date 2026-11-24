import { MessageSquareTextIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { CardRail, Disclosure, PopLink } from '@/components/motion'
import { EmptyState } from '@/components/app/empty-state'
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
      <div className="b-tools-empty">
        <MessageSquareTextIcon aria-hidden="true" />
        <EmptyState
          title="아직 독자 반응이 없어요."
          description="집필 화면의 ‘독자 반응’ 탭에서도 실행할 수 있어요."
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-label={group.chapterTitle}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="b-heading">{group.chapterTitle}</h2>
            {group.chapterHref && (
              <PopLink variant="flat" href={group.chapterHref}>
                회차 열기
              </PopLink>
            )}
          </div>
          {group.runs.map((run, index) =>
            index === 0 ? (
              <RunCard key={run.id} run={run} personaNames={personaNames} />
            ) : (
              <Disclosure
                key={run.id}
                title={formatKoreanDateTime(run.createdAt)}
                className="b-tools-disclosure"
              >
                <RunCard run={run} personaNames={personaNames} />
              </Disclosure>
            ),
          )}
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
    <div className="b-tools-paper grid min-w-0 grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">{formatKoreanDateTime(run.createdAt)}</span>
        <span>{`평균 ★ ${average.toFixed(1)}`}</span>
      </div>
      <CardRail label="독자별 반응" railClassName="b-tools-reader-rail">
        {personas.map((persona, index) => (
          <div
            className="b-sequence"
            key={persona.personaId}
            style={{ '--b-i': Math.min(index, 5) } as CSSProperties}
          >
            <ReaderSimResultCard
              name={personaNames[persona.personaId] ?? persona.personaId}
              persona={persona}
            />
          </div>
        ))}
      </CardRail>
      {run.result.summary && (
        <p className="text-sm">
          <span className="font-medium">전체 요약 </span>
          {run.result.summary}
        </p>
      )}
    </div>
  )
}
