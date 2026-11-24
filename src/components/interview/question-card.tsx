'use client'

import { useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewFocus } from '@/db/types'

const MAX_ANSWER_LENGTH = 5000

type QuestionCardProps = {
  number: number
  topic: string
  question: string
  rationale: string
  focus: InterviewFocus
  canEdit: boolean
  busy: boolean
  /** Set while the answer is being organized: the progress and cancel control replace the buttons. */
  answering: { elapsedSec: number; onCancel: () => void } | null
  onAnswer: (answer: string) => void
  onSkip: () => void
}

/** The one question on screen: topic, question, why it is asked, and the answer box. */
export function QuestionCard({
  number,
  topic,
  question,
  rationale,
  focus,
  canEdit,
  busy,
  answering,
  onAnswer,
  onSkip,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState('')
  const trimmed = answer.trim()

  return (
    <article
      aria-labelledby="interview-question"
      className="wg-import-question wg-import-row grid min-w-0 gap-4"
    >
      <span className="wg-import-question-number font-mono text-sm" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="wg-import-question-heading grid min-w-0 gap-2">
        <div className="wg-import-write flex min-w-0 flex-wrap items-center gap-2">
          {topic && (
            <Badge variant="outline" className="max-w-full wrap-anywhere">
              {topic}
            </Badge>
          )}
          <Badge variant="outline">{focus === 'story' ? '다음 전개' : '설정 채우기'}</Badge>
        </div>
        <h2 id="interview-question" className="wg-import-question-text b-subhead wrap-anywhere">
          {question}
        </h2>
        {rationale && (
          <p className="wg-import-write text-sm text-muted-ink wrap-anywhere">{rationale}</p>
        )}
      </div>

      {canEdit ? (
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed) onAnswer(trimmed)
          }}
        >
          <Label htmlFor="interview-answer">답변</Label>
          <Textarea
            id="interview-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={5}
            className="min-h-32 font-heading"
            maxLength={MAX_ANSWER_LENGTH}
            disabled={busy}
            placeholder="떠오르는 대로 적어 주세요."
          />
          {answering ? (
            <AiRunStatus
              label="답 정리하는 중"
              elapsedSec={answering.elapsedSec}
              onCancel={answering.onCancel}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || trimmed.length === 0}>
                답하기
              </Button>
              <Button type="button" variant="link" disabled={busy} onClick={onSkip}>
                건너뛰기
              </Button>
            </div>
          )}
        </form>
      ) : (
        <p className="text-sm text-muted-ink">편집자 이상만 답할 수 있어요.</p>
      )}
    </article>
  )
}
