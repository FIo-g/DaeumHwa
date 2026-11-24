'use client'

import { useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PopButton } from '@/components/motion'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InterviewFocus } from '@/db/types'

const MAX_ANSWER_LENGTH = 5000

type QuestionCardProps = {
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
    <article aria-labelledby="interview-question" className="grid min-w-0 gap-4">
      <div className="b-tools-paper b-tools-question grid gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {topic && <Badge variant="secondary">{topic}</Badge>}
          <Badge variant="outline">{focus === 'story' ? '다음 전개' : '설정 채우기'}</Badge>
        </div>
        <h2 id="interview-question" className="b-subhead wrap-anywhere">
          {question}
        </h2>
        {rationale && <p className="text-sm text-muted-foreground">{rationale}</p>}
      </div>

      {canEdit ? (
        <form
          className="b-tools-paper grid min-w-0 gap-3"
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
              <PopButton type="submit" disabled={busy || trimmed.length === 0}>
                답하기
              </PopButton>
              <Button type="button" variant="outline" disabled={busy} onClick={onSkip}>
                건너뛰기
              </Button>
            </div>
          )}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">편집자 이상만 답할 수 있어요.</p>
      )}
    </article>
  )
}
