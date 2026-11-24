'use client'

import { useRef, type HTMLAttributes, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useEntered } from './hooks'

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
  const revealed = useEntered(node)

  return (
    <Element
      {...props}
      ref={(element: HTMLElement | null) => {
        node.current = element
      }}
      className={cn(!effectOnly && 'wg-reveal', decorative && 'wg-reveal-decorative', className)}
      data-revealed={revealed}
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
