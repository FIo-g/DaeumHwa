import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FACT_STATUS_LABEL } from '@/lib/labels'
import type { FactStatus } from '@/db/types'

const STYLE: Record<FactStatus, string> = {
  confirmed: 'border-solid',
  assumed: 'border-dashed',
  undecided: 'border-dotted',
}

/** Status tag for a fact. Assumed facts show the [가정] marker. */
export function FactStatusBadge({ status }: { status: FactStatus }) {
  const text = status === 'assumed' ? '[가정]' : FACT_STATUS_LABEL[status]
  return (
    <Badge variant="outline" className={cn('border-ink bg-paper text-ink', STYLE[status])}>
      {text}
    </Badge>
  )
}
