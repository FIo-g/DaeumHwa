'use client'

import { SignpostIcon } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AiBadge } from '@/components/app/ai-badge'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { CardStack, Disclosure, PopButton, Stagger } from '@/components/motion'
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
    <div className="flex flex-col gap-6">
      <div className="b-tools-paper b-tools-request">
        <p className="text-sm text-muted-ink">
          AI가 열린 떡밥과 인물 상태, 최근 회차 요약을 읽고 다음 전개를 제안해요. 결정은 작가님이
          해요.
        </p>
        {canRun &&
          (ai.running ? (
            <div className="b-tools-running">
              <span className="b-tools-working-papers" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <AiRunStatus label="조언 만드는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
            </div>
          ) : (
            <PopButton onClick={() => void requestAdvice()}>다음 전개 조언 받기</PopButton>
          ))}
      </div>

      {latest ? (
        <section aria-label="최근 조언" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="b-heading">최근 조언</h2>
            <AiBadge />
            <span className="text-xs text-muted-foreground">
              {formatKoreanDateTime(latest.createdAt)}
            </span>
          </div>
          <AdviceResultBody key={latest.id} result={latest.result} />
        </section>
      ) : (
        <div className="b-tools-empty">
          <SignpostIcon aria-hidden="true" />
          <EmptyState title="아직 받은 조언이 없어요." />
        </div>
      )}

      {earlier.length > 0 && (
        <section aria-label="지난 조언" className="flex flex-col gap-2">
          <h2 className="b-heading">지난 조언</h2>
          <Stagger className="grid gap-2">
            {earlier.map((run, index) => (
              <Disclosure
                key={run.id}
                title={
                  <span className="flex items-center gap-3">
                    <span className="b-number" aria-hidden="true">
                      {index + 2}
                    </span>
                    {formatKoreanDateTime(run.createdAt)}
                  </span>
                }
                className="b-tools-disclosure"
              >
                <div className="b-tools-disclosure-body">
                  <AdviceResultBody result={run.result} />
                </div>
              </Disclosure>
            ))}
          </Stagger>
        </section>
      )}
    </div>
  )
}

function AdviceResultBody({ result }: { result: AdviceResult }) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {result.warnings.length > 0 && (
        <section aria-label="확인할 점" className="b-tools-paper grid gap-1 bg-mustard/35 text-sm">
          <h3 className="font-medium">확인할 점</h3>
          <ul className="list-disc pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      <CardStack className="b-tools-advice-stack">
        {result.options.map((option, index) => (
          <AdviceOption
            key={`${index}-${option.title}`}
            option={option}
            index={index}
            recommended={index === result.recommendedIndex}
            recommendationReason={result.recommendationReason}
            selected={selected === index}
            onSelect={() => setSelected(selected === index ? null : index)}
          />
        ))}
      </CardStack>
    </div>
  )
}
