'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MAX_ANSWER_LENGTH = 5000

type QuestionCardProps = {
  topic: string
  question: string
  rationale: string
  canEdit: boolean
  busy: boolean
  onAnswer: (answer: string) => void
  onSkip: () => void
}

/** The one question on screen: topic, question, why it is asked, and the answer box. */
export function QuestionCard({
  topic,
  question,
  rationale,
  canEdit,
  busy,
  onAnswer,
  onSkip,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState('')
  const trimmed = answer.trim()

  return (
    <article aria-labelledby="interview-question" className="grid gap-4 rounded-xl border p-5">
      <div className="grid gap-2">
        {topic && (
          <Badge variant="secondary" className="w-fit">
            {topic}
          </Badge>
        )}
        <h2 id="interview-question" className="text-lg font-semibold leading-snug">
          {question}
        </h2>
        {rationale && <p className="text-sm text-muted-foreground">{rationale}</p>}
      </div>

      {canEdit ? (
        <form
          className="grid gap-3"
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
            placeholder="떠오르는 대로 적어도 됩니다."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || trimmed.length === 0}>
              답하기
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onSkip}>
              건너뛰기
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">편집자 이상만 답할 수 있습니다.</p>
      )}
    </article>
  )
}
