'use client'

import { Children, isValidElement, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'
import { usePointerTilt } from './hooks'

type TiltCardProps = ComponentPropsWithoutRef<'div'> & {
  faceClassName?: string
  pointer?: boolean
}

export function TiltCard({
  children,
  className,
  faceClassName,
  pointer = true,
  ...props
}: TiltCardProps) {
  const tilt = usePointerTilt()
  return (
    <div
      {...props}
      {...(pointer ? tilt : undefined)}
      className={cn('b-card b-pointer', className)}
      data-pointer={pointer}
    >
      <div className="b-pointer__face">
        <div className={cn('b-card__face', faceClassName)}>{children}</div>
      </div>
    </div>
  )
}

export function CardStack({ children, className, ...props }: ComponentPropsWithoutRef<'div'>) {
  const cards = Children.toArray(children)
  return (
    <div className={cn('b-card-stack', className)} {...props}>
      {cards.map((child, index) => (
        <TiltCard
          key={isValidElement(child) ? child.key : index}
          pointer={false}
          className={
            index === 0
              ? 'b-card--first'
              : index === cards.length - 1
                ? 'b-card--last'
                : 'b-card--middle'
          }
        >
          {child}
        </TiltCard>
      ))}
    </div>
  )
}
