'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AiBadge } from '@/components/app/ai-badge'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { Disclosure, PopButton, Sheet } from '@/components/motion'
import type { AdviceResult } from '@/ai/tasks/direction-advice'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import { formatKoreanDateTime } from '@/lib/dates'
import { AdviceOption } from './advice-option'

export type AdviceRunView = {
  id: string
  /** ISO timestamp of the run. */
  createdAt: string
  result: AdviceResult
}

type AdviceViewProps = {
  workId: string
  /** Editor role or higher can ask for advice. */
  canRun: boolean
  /** Finished runs, newest first. */
  runs: AdviceRunView[]
}

/** Advice page body: the latest result, a request button, and earlier runs. */
export function AdviceView({ workId, canRun, runs }: AdviceViewProps) {
  const router = useRouter()
  const ai = useAiRun()
  const [latest, ...earlier] = runs

  async function requestAdvice() {
    // A route handler, not a Server Action: the advice can run for minutes.
    const created = await ai.run((signal) =>
      runAction(
        postAction<{ runId: string; result: AdviceResult }>(
          `/api/works/${workId}/advice`,
          {},
          { signal },
        ),
        { success: '새 조언을 받았어요.' },
      ),
    )
    if (created) router.refresh()
  }

  return (
    <div className="wg-advice-body">
      <div className="wg-advice-request">
        <p className="wg-advice-question b-ruled">
          AI가 열린 떡밥과 인물 상태, 최근 회차 요약을 읽고 다음 전개를 제안해요. 결정은 작가님이
          해요.
        </p>
        {canRun &&
          (ai.running ? (
            <AiRunStatus label="조언 만드는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
          ) : (
            <PopButton onClick={() => void requestAdvice()}>다음 전개 조언 받기</PopButton>
          ))}
      </div>

      {latest ? (
        <Sheet aria-label="최근 조언">
          <div className="wg-advice-sheet-heading">
            <h2 className="b-subhead">최근 조언</h2>
            <AiBadge />
            <time className="wg-advice-timestamp" dateTime={latest.createdAt}>
              {formatKoreanDateTime(latest.createdAt)}
            </time>
          </div>
          <AdviceResultBody key={latest.id} result={latest.result} />
        </Sheet>
      ) : (
        <div className="wg-advice-empty">
          <EmptyState title="아직 받은 조언이 없어요." />
          <div className="b-ruled wg-advice-empty-lines" aria-hidden="true" />
        </div>
      )}

      {earlier.length > 0 && (
        <section aria-label="지난 조언" className="wg-advice-history">
          <h2 className="b-subhead">지난 조언</h2>
          <div>
            {earlier.map((run, index) => (
              <Disclosure
                key={run.id}
                title={
                  <span className="wg-advice-history-title">
                    <span className="wg-advice-row-number" aria-hidden="true">
                      {index + 2}
                    </span>
                    <time className="b-muted" dateTime={run.createdAt}>
                      {formatKoreanDateTime(run.createdAt)}
                    </time>
                  </span>
                }
                className="wg-advice-history-row"
              >
                <AdviceResultBody result={run.result} />
              </Disclosure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AdviceResultBody({ result }: { result: AdviceResult }) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="wg-advice-results">
      {result.warnings.length > 0 && (
        <section aria-label="확인할 점" className="wg-advice-detail">
          <h3 className="b-label font-medium">확인할 점</h3>
          <ul className="list-disc ps-4">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      <div>
        {result.options.map((option, index) => (
          <AdviceOption
            key={`${index}-${option.title}`}
            option={option}
            index={index}
            recommended={index === result.recommendedIndex}
            recommendationReason={result.recommendationReason}
            selected={selected === index}
            onSelect={() => setSelected((current) => (current === index ? null : index))}
          />
        ))}
      </div>
    </div>
  )
}
