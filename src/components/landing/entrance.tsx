'use client'

import { useRef, type CSSProperties } from 'react'
import { GridTitle } from '@/components/motion'
import { useViewportEntrance } from '@/components/motion/hooks'

export function useLandingEntrance<Element extends HTMLElement>() {
  const ref = useRef<Element>(null)
  useViewportEntrance(ref)
  return { ref }
}

export function landingOrder(index: number): CSSProperties {
  return { '--wg-landing-hero-order': index } as CSSProperties
}

export function LandingTitle({
  id,
  children,
  hero = false,
  columns,
}: {
  id: string
  children: string
  hero?: boolean
  columns?: number
}) {
  return (
    <GridTitle
      id={id}
      as={hero ? 'h1' : 'h2'}
      size={hero ? 'hero' : 'section'}
      columns={hero ? 8 : columns}
    >
      {children}
    </GridTitle>
  )
}

export function PaperBoundary() {
  return <div className="wg-landing-hero-boundary" aria-hidden="true" />
}
