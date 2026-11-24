import { Children, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export function Stagger({ children, className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('b-stagger', className)} {...props}>
      {Children.map(children, (child, index) =>
        child == null ? null : (
          <div style={{ '--b-i': Math.min(index, 5) } as CSSProperties}>{child}</div>
        ),
      )}
    </div>
  )
}
