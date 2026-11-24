'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { EntryKind } from '@/db/types'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { KindIcon } from './kind-icon'

type GraphControlsProps = {
  intro?: ReactNode
  actions?: ReactNode
  latestPosition: number
  position: number
  positionSuffix?: string
  onPositionChange: (position: number) => void
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
  /** Kinds that have at least one card in this work. */
  kinds: EntryKind[]
  hiddenKinds: EntryKind[]
  onToggleKind: (kind: EntryKind) => void
}

export function GraphControls({
  intro,
  actions,
  latestPosition,
  position,
  positionSuffix = '화까지',
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
    <div className="wg-graph-controls">
      <div className="wg-graph-toolbar">
        {intro}
        <div className="wg-graph-range">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="graph-position">회차 기준</Label>
            <span className="font-mono text-sm" aria-live="polite">
              {showAll ? '전체' : `${shown}${positionSuffix}`}
            </span>
          </div>
          <input
            id="graph-position"
            type="range"
            min={1}
            max={max}
            step={1}
            value={shown}
            aria-valuetext={`${shown}화`}
            disabled={showAll}
            onChange={(e) => onPositionChange(Number(e.target.value))}
            className="wg-graph-slider b-control"
            style={{ backgroundSize: `max(4px, ${100 / max}%) 1.5rem` }}
          />
          <div className="wg-graph-cells">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={showAll || shown <= 1}
              onClick={() => onPositionChange(shown - 1)}
            >
              이전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={showAll || shown >= max}
              onClick={() => onPositionChange(shown + 1)}
            >
              다음
            </Button>
          </div>
        </div>
        {actions}
      </div>

      <div className="wg-graph-toolbar">
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            id="graph-show-all"
            checked={showAll}
            onCheckedChange={onShowAllChange}
          />
          <Label htmlFor="graph-show-all">전체 보기</Label>
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="카드 종류">
            <span className="text-sm text-muted-foreground">카드 종류</span>
            <div className="wg-graph-cells">
              {kinds.map((kind) => {
                const hidden = hiddenKinds.includes(kind)
                return (
                  <button
                    key={kind}
                    type="button"
                    className="b-chip b-control wg-graph-kind"
                    aria-pressed={!hidden}
                    onClick={() => onToggleKind(kind)}
                  >
                    <KindIcon kind={kind} className="size-2.5" />
                    {ENTRY_KIND_LABEL[kind]}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
