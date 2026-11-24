'use client'

import { useRef, type HTMLAttributes, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useEntered } from './hooks'

const OFFSETS = {
  up: ['0px', '4px'],
  down: ['0px', '-4px'],
  left: ['4px', '0px'],
  right: ['-4px', '0px'],
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
  const revealed = useEntered(node)

  const [x, y] = OFFSETS[direction]
  return (
    <Element
      {...props}
      ref={(element: HTMLElement | null) => {
        node.current = element
      }}
      className={cn(!effectOnly && 'wg-reveal', decorative && 'wg-reveal-decorative', className)}
      data-revealed={revealed}
      style={
        {
          '--wg-reveal-x': x,
          '--wg-reveal-y': y,
          '--wg-delay': `${delay}ms`,
          ...style,
        } as CSSProperties
      }
    />
  )
}
