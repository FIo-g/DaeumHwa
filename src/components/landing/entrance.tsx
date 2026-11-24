'use client'

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePrefersReducedMotion } from '@/components/motion'

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
  return { '--b-landing-order': index } as CSSProperties
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
  const entrance = useLandingEntrance<HTMLHeadingElement>()
  const Heading = hero ? 'h1' : 'h2'
  const className = hero ? 'b-display b-landing-hero-title' : 'b-title b-landing-section-title'

  return (
    <Heading {...entrance} id={id} className={className}>
      {children.split(' ').map((word, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="b-landing-heading-word" style={landingOrder(index)}>
            {word}
          </span>
        </Fragment>
      ))}
    </Heading>
  )
}

export function PaperBoundary() {
  return (
    <div className="b-landing-boundary b-decor" aria-hidden="true">
      <span className="b-landing-boundary-sheet b-parallax" />
      <span className="b-landing-boundary-sheet b-parallax" />
    </div>
  )
}
