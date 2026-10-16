'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FactStatus } from '@/db/types'
import { FACT_STATUSES } from '@/db/types'
import { FACT_STATUS_LABEL } from '@/lib/labels'

type FactStatusSelectProps = {
  value: FactStatus
  onChange: (status: FactStatus) => void
  /** When given, a hidden input with this name carries the value for form submits. */
  name?: string
}

/** Three-way toggle for 확정 / 가정 / 미정. */
export function FactStatusSelect({ value, onChange, name }: FactStatusSelectProps) {
  return (
    <div className="inline-flex flex-col">
      <ToggleGroup
        multiple={false}
        value={[value]}
        onValueChange={(next) => {
          const picked = next[0] as FactStatus | undefined
          if (picked) onChange(picked)
        }}
        aria-label="사실 상태"
        size="sm"
        variant="outline"
      >
        {FACT_STATUSES.map((status) => (
          <ToggleGroupItem key={status} value={status}>
            {FACT_STATUS_LABEL[status]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  )
}
