import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { type LayerSegment, segmentText } from './text-ops'
import type { Highlight, HighlightKind } from './types'

/**
 * Typography shared by the textarea and the highlight layer. Both must use exactly the same
 * font, padding, line height and wrapping, or the marks drift away from the letters.
 */
export const MANUSCRIPT_TEXT_CLASS =
  'w-full px-6 py-5 text-[17px] leading-[2.1] font-serif whitespace-pre-wrap [overflow-wrap:anywhere] border-0'

const MARK_CLASS: Record<HighlightKind, string> = {
  issue: 'proof-underline',
  spelling: 'underline decoration-mark decoration-wavy decoration-1 underline-offset-[6px]',
  comment: 'bg-canon/12',
  reader: 'bg-input/25',
  naming: 'underline decoration-canon decoration-dotted decoration-2 underline-offset-[6px]',
  search: 'bg-[#f1e39b]',
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
        'bg-transparent text-transparent',
        MARK_CLASS[segment.kind],
        segment.active && segment.kind === 'issue' && '[background-size:100%_3px]',
        segment.active && segment.kind !== 'issue' && 'ring-2 ring-canon/60',
      )}
    >
      {segment.text}
    </mark>
  )
}
