import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { type LayerSegment, segmentText } from './text-ops'
import type { Highlight, HighlightKind } from './types'

/**
 * Typography shared by the textarea and the highlight layer. Both must use exactly the same
 * font, padding, line height and wrapping, or the marks drift away from the letters.
 */
export const MANUSCRIPT_TEXT_CLASS =
  'w-full px-5 py-4 text-[17px] leading-8 font-sans whitespace-pre-wrap [overflow-wrap:anywhere] border-0'

const MARK_CLASS: Record<HighlightKind, string> = {
  issue: 'bg-amber-200/80 dark:bg-amber-700/60',
  spelling:
    'underline decoration-red-500 decoration-2 underline-offset-4 bg-red-100/60 dark:bg-red-900/40',
  comment: 'bg-sky-200/80 dark:bg-sky-700/50',
  reader: 'bg-violet-200/80 dark:bg-violet-700/50',
  naming: 'bg-emerald-200/80 dark:bg-emerald-700/50',
  search: 'bg-yellow-200/90 dark:bg-yellow-600/50',
}

type HighlightLayerProps = {
  text: string
  highlights: Highlight[]
}

/**
 * Background layer behind the textarea. Draws only the highlight backgrounds; its own text is
 * transparent, so the textarea stays the one thing the author sees and types into.
 */
export const HighlightLayer = memo(function HighlightLayer({
  text,
  highlights,
}: HighlightLayerProps) {
  const segments = useMemo(() => segmentText(text, highlights), [text, highlights])
  return (
    <div
      aria-hidden="true"
      className={cn(
        MANUSCRIPT_TEXT_CLASS,
        'pointer-events-none absolute inset-0 overflow-hidden text-transparent',
      )}
    >
      {segments.map((segment, index) => (
        <SegmentView key={index} segment={segment} />
      ))}
    </div>
  )
})

function SegmentView({ segment }: { segment: LayerSegment }) {
  if (!segment.id || !segment.kind) return <span>{segment.text}</span>
  return (
    <mark
      data-kind={segment.kind}
      data-active={segment.active ? 'true' : undefined}
      className={cn(
        'rounded-sm text-transparent',
        MARK_CLASS[segment.kind],
        segment.active && 'ring-2 ring-ring',
      )}
    >
      {segment.text}
    </mark>
  )
}
