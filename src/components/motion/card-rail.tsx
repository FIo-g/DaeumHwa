'use client'

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './hooks'

type Drag = { id: number; x: number; left: number; active: boolean }

function snapPoints(node: HTMLElement) {
  const start =
    node.getBoundingClientRect().left + (parseFloat(getComputedStyle(node).scrollPaddingLeft) || 0)
  const end = Math.max(0, node.scrollWidth - node.clientWidth)
  return [
    0,
    ...Array.from(node.children, (child) =>
      Math.max(0, Math.min(end, child.getBoundingClientRect().left - start + node.scrollLeft)),
    ),
    end,
  ]
}

export function CardRail({
  children,
  label = '카드 목록',
  className,
  railClassName,
}: {
  children: ReactNode
  label?: string
  className?: string
  railClassName?: string
}) {
  const id = useId()
  const rail = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const reduced = usePrefersReducedMotion()
  const [edges, setEdges] = useState({ start: true, end: true })

  const canScroll = !edges.start || !edges.end

  function updateEdges() {
    const node = rail.current
    if (!node) return
    const start = node.scrollLeft <= 1
    const end = node.scrollWidth - node.clientWidth - node.scrollLeft <= 1
    setEdges((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    )
  }

  useEffect(() => {
    const node = rail.current
    if (!node) return
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    resize?.observe(node)
    for (const child of node.children) resize?.observe(child)
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => {
      window.removeEventListener('resize', updateEdges)
      resize?.disconnect()
    }
  }, [children])

  function step(direction: -1 | 1) {
    const node = rail.current
    if (!node) return

    const current = node.scrollLeft
    const targets = snapPoints(node)
    const left =
      direction === 1
        ? targets.find((target) => target > current + 1)
        : targets.findLast((target) => target < current - 1)
    if (left !== undefined) node.scrollTo({ left, behavior: reduced ? 'instant' : 'smooth' })
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, input, textarea, select, [contenteditable], [role="button"]')
    )
      return
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      left: event.currentTarget.scrollLeft,
      active: false,
    }
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    const node = event.currentTarget
    if (state?.id !== event.pointerId) return

    const delta = state.x - event.clientX
    if (!state.active) {
      if (Math.abs(delta) <= 8) return
      state.active = true
      node.setPointerCapture(event.pointerId)
      node.dataset.dragging = 'true'
    }
    node.scrollTo({ left: state.left + delta, behavior: 'instant' })
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (state?.id !== event.pointerId) return

    drag.current = null
    if (!state.active) return
    const node = event.currentTarget
    const current = node.scrollLeft
    const left = snapPoints(node).reduce((nearest, target) =>
      Math.abs(target - current) < Math.abs(nearest - current) ? target : nearest,
    )
    if (node.hasPointerCapture(state.id)) node.releasePointerCapture(state.id)
    delete node.dataset.dragging
    node.scrollTo({ left, behavior: reduced ? 'instant' : 'smooth' })
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex justify-end gap-2" hidden={!canScroll}>
        <Button
          variant="outline"
          size="icon"
          aria-label="이전 카드"
          aria-controls={id}
          disabled={edges.start}
          onClick={() => step(-1)}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="다음 카드"
          aria-controls={id}
          disabled={edges.end}
          onClick={() => step(1)}
        >
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
      <div
        id={id}
        ref={rail}
        tabIndex={0}
        role="region"
        aria-label={label}
        className={cn('b-rail', railClassName)}
        onScroll={updateEdges}
        onKeyDown={(event) => {
          if (
            !canScroll ||
            event.target !== event.currentTarget ||
            !['ArrowLeft', 'ArrowRight'].includes(event.key)
          )
            return
          event.preventDefault()
          step(event.key === 'ArrowLeft' ? -1 : 1)
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={(event) => {
          if (!drag.current?.active) endDrag(event)
        }}
      >
        {children}
      </div>
    </div>
  )
}
