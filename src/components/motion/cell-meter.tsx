'use client'

import { useRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useEntered } from './hooks'

type CellMeterProps = {
  value: number
  max: number
  label?: string
  cells?: number
  className?: string
}

export function CellMeter({
  value,
  max,
  label,
  cells = Math.min(10, max),
  className,
}: CellMeterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const entered = useEntered(ref)
  const limit = Number.isFinite(max) ? Math.max(0, max) : 0
  const count = Number.isFinite(cells) ? Math.max(1, Math.ceil(cells)) : 1
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0
  const filled = limit > 0 ? (Math.min(amount, limit) / limit) * count : 0

  return (
    <span
      ref={ref}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(amount, limit)}
      aria-valuetext={`${amount}/${limit}`}
      className={cn('wg-cell-meter', className)}
      style={{ '--wg-cell-meter-count': count } as CSSProperties}
      data-revealed={entered}
    >
      {Array.from({ length: count }, (_, index) => {
        const fill = Math.max(0, Math.min(1, filled - index))
        return (
          <span
            key={index}
            aria-hidden="true"
            className="wg-cell-meter-cell"
            style={
              {
                '--wg-cell-meter-index': index,
                '--wg-cell-meter-fill': `${fill * 100}%`,
              } as CSSProperties
            }
          />
        )
      })}
    </span>
  )
}
