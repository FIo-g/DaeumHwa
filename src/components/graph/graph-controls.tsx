'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { EntryKind } from '@/db/types'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { ENTRY_KIND_COLOR } from './graph-model'

type GraphControlsProps = {
  latestPosition: number
  position: number
  onPositionChange: (position: number) => void
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
  /** Kinds that have at least one card in this work. */
  kinds: EntryKind[]
  hiddenKinds: EntryKind[]
  onToggleKind: (kind: EntryKind) => void
}

/** Chapter slider, 전체 보기 switch, and kind chips (each chip doubles as a legend entry). */
export function GraphControls({
  latestPosition,
  position,
  onPositionChange,
  showAll,
  onShowAllChange,
  kinds,
  hiddenKinds,
  onToggleKind,
}: GraphControlsProps) {
  const max = Math.max(1, latestPosition)
  const shown = Math.min(Math.max(position, 1), max)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="graph-position">회차 기준</Label>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {showAll ? '전체' : `${shown}화까지`}
            </span>
          </div>
          <input
            id="graph-position"
            type="range"
            min={1}
            max={max}
            step={1}
            value={shown}
            disabled={showAll}
            onChange={(e) => onPositionChange(Number(e.target.value))}
            className="w-full accent-primary disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="graph-show-all" checked={showAll} onCheckedChange={onShowAllChange} />
          <Label htmlFor="graph-show-all">전체 보기</Label>
        </div>
      </div>

      {kinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="카드 종류">
          {kinds.map((kind) => {
            const hidden = hiddenKinds.includes(kind)
            return (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={hidden ? 'outline' : 'secondary'}
                aria-pressed={!hidden}
                onClick={() => onToggleKind(kind)}
                className={hidden ? 'opacity-50' : undefined}
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: ENTRY_KIND_COLOR[kind] }}
                />
                {ENTRY_KIND_LABEL[kind]}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
