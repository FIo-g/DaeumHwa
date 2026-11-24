'use client'

import type { CSSProperties } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { usePointerTilt } from '@/components/motion'

const slips = [
  { x: '-36px', y: '24px', color: 'var(--b-cream)' },
  { x: '0px', y: '-32px', color: 'var(--b-paper)' },
  { x: '36px', y: '24px', color: 'var(--b-sand)' },
]

export function ChapterHeading({ title, workTitle }: { title: string; workTitle: string }) {
  const tilt = usePointerTilt()
  return (
    <div className="b-writing-heading">
      <PageHeader title={title} description={workTitle} band="kraft" />
      <div className="b-writing-index b-pointer" aria-hidden="true" {...tilt}>
        <div className="b-writing-index-face b-pointer__face">
          {slips.map(({ x, y, color }, index) => (
            <span
              key={color}
              className="b-writing-slip"
              style={
                {
                  '--b-i': index,
                  '--b-from-x': x,
                  '--b-from-y': y,
                  '--b-writing-slip-color': color,
                } as CSSProperties
              }
            >
              <span className="b-piece" />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
