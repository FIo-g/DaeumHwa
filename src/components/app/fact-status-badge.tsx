import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FACT_STATUS_LABEL } from '@/lib/labels'
import type { FactStatus } from '@/db/types'

const STYLE: Record<FactStatus, string> = {
  confirmed:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  assumed: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  undecided: 'bg-muted text-muted-foreground',
}

/** Status tag for a fact. Assumed facts show the [가정] marker. */
export function FactStatusBadge({ status }: { status: FactStatus }) {
  const text = status === 'assumed' ? '[가정]' : FACT_STATUS_LABEL[status]
  return <Badge className={cn(STYLE[status])}>{text}</Badge>
}
