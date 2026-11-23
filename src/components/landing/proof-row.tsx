'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A proof row whose margin note lines up with the circled words, wherever the line wraps.
 * Sets `--leader-y` (the leader's offset from the row top) for the note to align to.
 */
export function ProofRow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    const place = () => {
      const anchor = row.querySelector<HTMLElement>('[data-proof-anchor]')
      if (!anchor) return
      const fontSize = parseFloat(getComputedStyle(anchor).fontSize)
      const y =
        anchor.getBoundingClientRect().top - row.getBoundingClientRect().top - 0.22 * fontSize
      row.style.setProperty('--leader-y', `${Math.round(y)}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(row)
    // The Myeongjo swaps in after first paint and moves the line breaks.
    void document.fonts.ready.then(place)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
