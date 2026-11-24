'use client'

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { cn } from '@/lib/utils'

type ScrollSource = {
  scrollRef?: RefObject<HTMLElement | null>
}

function findScrollSource(node: HTMLElement) {
  for (
    let parent = node.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (/auto|scroll|overlay|hidden/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return document.scrollingElement
}

function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  scrollRef?: ScrollSource['scrollRef'],
) {
  const [reading, setReading] = useState({ value: 0, measured: false })

  useEffect(() => {
    const node = ref.current
    const source = scrollRef?.current ?? (node && findScrollSource(node))
    if (!source) return

    const viewport = source === document.scrollingElement
    const eventTarget = viewport ? window : source
    const update = () => {
      const distance = source.scrollHeight - source.clientHeight
      const value = distance > 0 ? Math.max(0, Math.min(1, source.scrollTop / distance)) : 1
      const measured = distance <= 0 || Boolean(scrollRef)
      setReading((previous) =>
        previous.value === value && previous.measured === measured ? previous : { value, measured },
      )
    }

    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    const observeContent = () => {
      resize?.disconnect()
      resize?.observe(source)
      for (const child of (viewport ? document.body : source).children) resize?.observe(child)
      update()
    }
    const content = new MutationObserver(observeContent)
    content.observe(viewport ? document.body : source, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    observeContent()
    eventTarget.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      content.disconnect()
      resize?.disconnect()
      eventTarget.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref, scrollRef])

  return reading
}

export function ReadingProgress({ scrollRef, className }: ScrollSource & { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const { value, measured } = useScrollProgress(ref, scrollRef)
  return (
    <span ref={ref} className={cn('b-progress', className)} aria-hidden="true">
      <span
        className="b-progress__fill"
        data-measured={measured}
        style={{ '--b-progress': value } as CSSProperties}
      />
    </span>
  )
}

export function DotMeter({
  scrollRef,
  count = 5,
  label = '읽기 진행',
  className,
}: ScrollSource & { count?: number; label?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const { value } = useScrollProgress(ref, scrollRef)
  const length = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 5
  const filled = Math.floor(value * length)
  return (
    <span
      ref={ref}
      className={cn('inline-flex items-center gap-2', className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
    >
      {Array.from({ length }, (_, index) => (
        <span
          key={index}
          className="b-dot b-meter-dot"
          data-filled={index < filled}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
