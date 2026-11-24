import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

type ColorBandProps = ComponentPropsWithoutRef<'section'> & {
  color?: 'mustard' | 'leaf' | 'apricot' | 'paper' | 'ink'
  density?: 'scene' | 'app'
  innerClassName?: string
}

export function ColorBand({
  color = 'paper',
  density = 'scene',
  className,
  innerClassName,
  children,
  ...props
}: ColorBandProps) {
  return (
    <section
      {...props}
      className={cn('b-band', `b-band--${color}`, density === 'app' && 'b-band--app', className)}
    >
      <div className={cn('b-wrap', innerClassName)}>{children}</div>
    </section>
  )
}
