import { FACT_STATUS_LABEL } from '@/lib/labels'
import type { FactStatus } from '@/db/types'

/** Status tag for a fact. Assumed facts show the [가정] marker. */
export function FactStatusBadge({ status }: { status: FactStatus }) {
  const text = status === 'assumed' ? '[가정]' : FACT_STATUS_LABEL[status]
  return (
    <span className="wg-shell-fact-status">
      <span className="wg-shell-fact-mark" data-status={status} aria-hidden="true" />
      {text}
    </span>
  )
}
