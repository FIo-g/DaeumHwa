import { StarIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import { cn } from '@/lib/utils'

export type ReaderSimPersonaResult = ReaderSimResult['personas'][number]
export type ReaderSimMoment = ReaderSimPersonaResult['moments'][number]

const REACTION_LABEL: Record<ReaderSimMoment['reaction'], string> = {
  confused: '헷갈림',
  bored: '지루함',
  excited: '몰입',
  dropoff: '이탈 위험',
  moved: '감동',
}

const REACTION_STYLE: Record<ReaderSimMoment['reaction'], string> = {
  confused: 'bg-kraft',
  bored: 'bg-muted',
  excited: 'bg-sand',
  dropoff: 'bg-paper border-dashed',
  moved: 'bg-cream',
}

const RISK_LABEL: Record<ReaderSimPersonaResult['dropOffRisk'], string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
}

/** Rating as five stars, clamped to 0–5. */
export function ratingStars(rating: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(rating)))
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`
}

/** One persona's reaction to a chapter: rating, drop-off risk, summary, and moments. */
export function ReaderSimResultCard({
  name,
  persona,
}: {
  name: string
  persona: ReaderSimPersonaResult
}) {
  const rating = Math.min(5, Math.max(0, Math.round(persona.rating)))
  return (
    <article className="b-tools-reader-note">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="b-subhead">{name}</h3>
        <span
          role="img"
          className="inline-flex gap-0.5 text-ink"
          aria-label={`별점 ${rating}점 (5점 만점)`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <StarIcon
              key={index}
              aria-hidden="true"
              className={cn('size-4', index < rating && 'fill-ink')}
            />
          ))}
        </span>
        <Badge
          variant="outline"
          className={cn(persona.dropOffRisk === 'high' && 'border-ink border-dashed')}
        >
          {`이탈 위험 ${RISK_LABEL[persona.dropOffRisk]}`}
        </Badge>
      </header>
      <p className="text-sm">{persona.overall}</p>
      {persona.moments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {persona.moments.map((moment, index) => (
            <li key={`${index}-${moment.quote}`} className="flex flex-col gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('text-ink', REACTION_STYLE[moment.reaction])}
                >
                  {REACTION_LABEL[moment.reaction]}
                </Badge>
              </div>
              <blockquote className="border-y border-ink/25 py-2 text-muted-ink">
                {moment.quote}
              </blockquote>
              <p>{moment.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
