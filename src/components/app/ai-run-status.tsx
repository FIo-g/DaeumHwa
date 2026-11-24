'use client'

import { Button } from '@/components/ui/button'

/** A running AI call: label, elapsed seconds and a cancel button. */
export function AiRunStatus({
  label,
  elapsedSec,
  onCancel,
}: {
  label: string
  elapsedSec: number
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-ink">
      <span className="b-ai-pulse" aria-hidden="true" />
      <span className="tabular-nums">{`${label}… ${elapsedSec}초`}</span>
      <Button variant="outline" size="sm" onClick={onCancel}>
        취소
      </Button>
    </div>
  )
}
