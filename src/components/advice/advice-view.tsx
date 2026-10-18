'use client'

import { useRouter } from 'next/navigation'
import { AiBadge } from '@/components/app/ai-badge'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
        { success: '새 조언을 받았습니다.' },
      ),
    )
    if (created) router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          열린 떡밥, 인물 상태, 최근 회차 요약을 바탕으로 다음 전개 선택지를 제안합니다.
        </p>
        {canRun &&
          (ai.running ? (
            <AiRunStatus label="조언 만드는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
          ) : (
            <Button onClick={() => void requestAdvice()}>다음 전개 조언 받기</Button>
          ))}
      </div>

      {latest ? (
        <section aria-label="최근 조언" className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">최근 조언</h2>
            <AiBadge />
            <span className="text-xs text-muted-foreground">
              {formatKoreanDateTime(latest.createdAt)}
            </span>
          </div>
          <AdviceResultBody result={latest.result} />
        </section>
      ) : (
        <EmptyState
          title="아직 받은 조언이 없습니다."
          description={
            canRun ? '버튼을 누르면 다음 전개 선택지 3개를 받을 수 있습니다.' : undefined
          }
        />
      )}

      <p className="text-sm text-muted-foreground">조언은 참고용입니다. 결정은 작가가 합니다.</p>

      {earlier.length > 0 && (
        <section aria-label="지난 조언" className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">지난 조언</h2>
          {earlier.map((run) => (
            <Collapsible key={run.id} className="flex flex-col gap-3">
              <CollapsibleTrigger
                render={<Button variant="outline" className="w-full justify-start" />}
              >
                {formatKoreanDateTime(run.createdAt)}
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-1">
                <AdviceResultBody result={run.result} />
              </CollapsibleContent>
            </Collapsible>
          ))}
        </section>
      )}
    </div>
  )
}

function AdviceResultBody({ result }: { result: AdviceResult }) {
  return (
    <div className="flex flex-col gap-4">
      {result.warnings.length > 0 && (
        <section
          aria-label="확인할 점"
          className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <h3 className="font-medium">확인할 점</h3>
          <ul className="list-disc pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {result.options.map((option, index) => (
          <AdviceOption
            key={`${index}-${option.title}`}
            option={option}
            index={index}
            recommended={index === result.recommendedIndex}
            recommendationReason={result.recommendationReason}
          />
        ))}
      </div>
    </div>
  )
}
