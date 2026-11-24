'use client'

import { useRef, type HTMLAttributes, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useViewportEntrance } from './hooks'

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'li' | 'article'
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  delay?: number
  decorative?: boolean
  effectOnly?: boolean
}

export function Reveal({
  as: Element = 'div',
  direction,
  delay = 0,
  decorative = false,
  effectOnly = false,
  className,
  style,
  ...props
}: RevealProps) {
  const node = useRef<HTMLElement>(null)
  useViewportEntrance(node)

  return (
    <Element
      {...props}
      ref={(element: HTMLElement | null) => {
        node.current = element
      }}
      className={cn(!effectOnly && 'wg-reveal', decorative && 'wg-reveal-decorative', className)}
      data-direction={direction}
      style={
        {
          '--wg-delay': `${delay}ms`,
          ...style,
        } as CSSProperties
      }
    />
  )
}
