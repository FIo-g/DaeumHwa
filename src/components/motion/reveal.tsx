'use client'

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './hooks'

const OFFSETS = {
  up: ['0px', '32px'],
  down: ['0px', '-32px'],
  left: ['32px', '0px'],
  right: ['-32px', '0px'],
  none: ['0px', '0px'],
} as const

type RevealProps = ComponentPropsWithoutRef<'div'> & {
  direction?: keyof typeof OFFSETS
  delay?: number
  range?: string
  decorative?: boolean
}

export function Reveal({
  direction = 'up',
  delay = 0,
  range,
  decorative = false,
  className,
  style,
  ...props
}: RevealProps) {
  const node = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (
      reduced ||
      !node.current ||
      window.CSS?.supports('animation-timeline', 'view()') ||
      typeof IntersectionObserver === 'undefined'
    )
      return

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
    <div
      {...props}
      ref={node}
      className={cn('b-reveal', decorative && 'b-reveal--decor', className)}
      data-revealed={revealed}
      style={
        {
          '--b-reveal-x': x,
          '--b-reveal-y': y,
          '--b-delay': `${delay}ms`,
          '--b-reveal-range': range,
          ...style,
        } as CSSProperties
      }
    />
  )
}
