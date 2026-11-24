'use client'

import { ScanLine } from '@/components/motion'
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
    <div className="wg-shell-ai-run flex flex-wrap items-center gap-3 text-sm">
      <ScanLine className="wg-shell-scan" />
      <span>
        {label}… <span className="wg-shell-count">{elapsedSec}초</span>
      </span>
      <Button variant="outline" size="sm" onClick={onCancel}>
        취소
      </Button>
    </div>
  )
}
