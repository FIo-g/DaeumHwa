import type { EntryKind } from '@/db/types'
import { cn } from '@/lib/utils'
import { ENTRY_KIND_MARK, kindShapePoints } from './graph-style'

export function KindIcon({ kind, className }: { kind: EntryKind; className?: string }) {
  const { shape, filled } = ENTRY_KIND_MARK[kind]
  const paint = filled
    ? { fill: 'currentColor' }
    : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' as const }
  const r = filled ? 4.6 : 4
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      data-kind-shape={shape}
      className={cn('size-3 shrink-0', className)}
    >
      {shape === 'circle' ? (
        <circle cx={6} cy={6} r={r} {...paint} />
      ) : (
        <polygon
          points={kindShapePoints(shape, 6, 6, r)
            .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
            .join(' ')}
          {...paint}
        />
      )}
    </svg>
  )
}
