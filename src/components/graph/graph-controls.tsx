'use client'

import type { ReactNode } from 'react'
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

/**
 * Chapter slider, 전체 보기 switch, and kind chips. Each chip doubles as a legend entry: it carries
 * the kind's graph mark, and like the filter chips elsewhere a shown kind is solid, a hidden one is
 * outlined.
 */
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
    <div className="b-wiki-graph-controls">
      <div className="b-wiki-toolbar">
        {intro}
        <div className="b-wiki-graph-range">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="graph-position">회차 기준</Label>
            <span className="text-sm text-muted-foreground" aria-live="polite">
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
            className="b-range w-full accent-ink disabled:opacity-50"
          />
        </div>
        {actions}
      </div>

      <div className="b-wiki-toolbar">
        <div className="flex items-center gap-2">
          <Switch id="graph-show-all" checked={showAll} onCheckedChange={onShowAllChange} />
          <Label htmlFor="graph-show-all">전체 보기</Label>
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="카드 종류">
            <span className="text-sm text-muted-foreground">카드 종류</span>
            {kinds.map((kind) => {
              const hidden = hiddenKinds.includes(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  className="b-chip b-wiki-choice gap-2"
                  aria-pressed={!hidden}
                  onClick={() => onToggleKind(kind)}
                >
                  <KindIcon kind={kind} className="size-2.5" />
                  {ENTRY_KIND_LABEL[kind]}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
