import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FACT_STATUS_LABEL } from '@/lib/labels'
import type { FactStatus } from '@/db/types'

// Proof-sheet statuses: a solid blue-pencil line for settled facts, dashed for guesses,
// dotted grey for blanks. Shape carries the status, so it reads without colour too.
const STYLE: Record<FactStatus, string> = {
  confirmed: 'border-canon text-canon',
  assumed: 'border-dashed border-canon/70 text-canon',
  undecided: 'border-dotted border-input text-muted-foreground',
}

/** Status tag for a fact. Assumed facts show the [가정] marker. */
export function FactStatusBadge({ status }: { status: FactStatus }) {
  const text = status === 'assumed' ? '[가정]' : FACT_STATUS_LABEL[status]
  return (
    <Badge variant="outline" className={cn('rounded-sm bg-sheet', STYLE[status])}>
      {text}
    </Badge>
  )
}
