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
  confused: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  bored: 'bg-muted text-muted-foreground',
  excited: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  dropoff: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  moved: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
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
    <article className="flex flex-col gap-3 rounded-xl border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{name}</h3>
        <span role="img" className="text-amber-600" aria-label={`별점 ${rating}점 (5점 만점)`}>
          {ratingStars(persona.rating)}
        </span>
        <Badge variant="outline" className={cn(persona.dropOffRisk === 'high' && 'border-red-300')}>
          {`이탈 위험 ${RISK_LABEL[persona.dropOffRisk]}`}
        </Badge>
      </header>
      <p className="text-sm">{persona.overall}</p>
      {persona.moments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {persona.moments.map((moment, index) => (
            <li key={`${index}-${moment.quote}`} className="flex flex-col gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={REACTION_STYLE[moment.reaction]}>
                  {REACTION_LABEL[moment.reaction]}
                </Badge>
              </div>
              <blockquote className="border-l-2 pl-3 text-muted-foreground">
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
