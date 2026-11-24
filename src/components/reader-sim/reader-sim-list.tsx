import { Disclosure, PopLink, Sheet } from '@/components/motion'
import { EmptyState } from '@/components/app/empty-state'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import { formatKoreanDateTime } from '@/lib/dates'
import { ReaderSimReaction } from './reader-sim-result'

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
      <div className="wg-advice-empty">
        <EmptyState
          title="아직 독자 반응이 없어요."
          description="집필 화면의 ‘독자 반응’ 탭에서도 실행할 수 있어요."
        />
      </div>
    )
  }

  return (
    <div className="wg-advice-history">
      {groups.map((group) => (
        <Sheet key={group.key} aria-label={group.chapterTitle}>
          <div className="wg-advice-sheet-heading justify-between">
            <h2 className="wg-advice-chapter-title">{group.chapterTitle}</h2>
            {group.chapterHref && (
              <PopLink variant="flat" href={group.chapterHref}>
                회차 열기
              </PopLink>
            )}
          </div>
          {group.runs.map((run, index) =>
            index === 0 ? (
              <RunResult key={run.id} run={run} personaNames={personaNames} />
            ) : (
              <Disclosure
                key={run.id}
                title={
                  <span className="wg-advice-history-title">
                    <span className="wg-advice-row-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <time className="b-muted" dateTime={run.createdAt}>
                      {formatKoreanDateTime(run.createdAt)}
                    </time>
                  </span>
                }
                className="wg-advice-history-row"
              >
                <RunResult run={run} personaNames={personaNames} />
              </Disclosure>
            ),
          )}
        </Sheet>
      ))}
    </div>
  )
}

function RunResult({
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
    <div>
      <div className="wg-advice-run-meta">
        <time className="wg-advice-timestamp" dateTime={run.createdAt}>
          {formatKoreanDateTime(run.createdAt)}
        </time>
        <span>{`평균 ★ ${average.toFixed(1)}`}</span>
      </div>
      <div role="region" aria-label="독자별 반응" tabIndex={0} className="min-w-0">
        {personas.map((persona, index) => (
          <ReaderSimReaction
            key={persona.personaId}
            index={index}
            name={personaNames[persona.personaId] ?? persona.personaId}
            persona={persona}
          />
        ))}
      </div>
      {run.result.summary && (
        <p className="wg-advice-detail wg-advice-reason">
          <span className="font-medium">전체 요약 </span>
          {run.result.summary}
        </p>
      )}
    </div>
  )
}
