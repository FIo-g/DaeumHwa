'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GridTitle, usePrefersReducedMotion } from '@/components/motion'

export function useLandingEntrance<Element extends HTMLElement>() {
  const ref = useRef<Element>(null)
  const [entered, setEntered] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const element = ref.current
    if (entered || reduced || !element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setEntered(true)
        observer.disconnect()
      },
      { rootMargin: '0px 0px -18% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [entered, reduced])

  return { ref, 'data-landed': entered && !reduced }
}

export function landingOrder(index: number): CSSProperties {
  return { '--wg-landing-hero-order': index } as CSSProperties
}

export function LandingTitle({
  id,
  children,
  hero = false,
}: {
  id: string
  children: string
  hero?: boolean
}) {
  return (
    <GridTitle
      id={id}
      as={hero ? 'h1' : 'h2'}
      size={hero ? 'hero' : 'section'}
      columns={hero ? 8 : undefined}
    >
      {children}
    </GridTitle>
  )
}

export function PaperBoundary() {
  return <div className="wg-landing-hero-boundary" aria-hidden="true" />
}
