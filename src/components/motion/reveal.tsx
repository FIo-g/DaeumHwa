'use client'

import { useEffect, useRef, useState, type HTMLAttributes, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './hooks'

const OFFSETS = {
  up: ['0px', '32px'],
  down: ['0px', '-32px'],
  left: ['32px', '0px'],
  right: ['-32px', '0px'],
  none: ['0px', '0px'],
} as const

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'li' | 'article'
  direction?: keyof typeof OFFSETS
  delay?: number
  decorative?: boolean
  effectOnly?: boolean
}

export function Reveal({
  as: Element = 'div',
  direction = 'up',
  delay = 0,
  decorative = false,
  effectOnly = false,
  className,
  style,
  ...props
}: RevealProps) {
  const node = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced || !node.current || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRevealed(true)
      observer.disconnect()
    })
    observer.observe(node.current)
    return () => observer.disconnect()
  }, [reduced])

  const [x, y] = OFFSETS[direction]
  return (
    <Element
      {...props}
      ref={(element: HTMLElement | null) => {
        node.current = element
      }}
      className={cn(!effectOnly && 'b-reveal', decorative && 'b-reveal--decor', className)}
      data-revealed={revealed}
      style={
        {
          '--b-reveal-x': x,
          '--b-reveal-y': y,
          '--b-delay': `${delay}ms`,
          ...style,
        } as CSSProperties
      }
    />
  )
}
