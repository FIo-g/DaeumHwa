import type { CSSProperties } from 'react'
import { CellMeter } from '@/components/motion'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'

export type ReaderSimPersonaResult = ReaderSimResult['personas'][number]
export type ReaderSimMoment = ReaderSimPersonaResult['moments'][number]

const REACTION_LABEL: Record<ReaderSimMoment['reaction'], string> = {
  confused: '헷갈림',
  bored: '지루함',
  excited: '몰입',
  dropoff: '이탈 위험',
  moved: '감동',
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
export function ReaderSimReaction({
  index,
  name,
  persona,
}: {
  index: number
  name: string
  persona: ReaderSimPersonaResult
}) {
  const rating = Math.min(5, Math.max(0, Math.round(persona.rating)))
  return (
    <article
      className="wg-advice-row wg-advice-reply"
      style={{ '--wg-advice-row': Math.min(index, 3) } as CSSProperties}
      tabIndex={0}
    >
      <div className="wg-advice-gutter" aria-hidden="true">
        <span className="wg-advice-row-number">{index + 1}</span>
      </div>
      <header className="wg-advice-reply-heading wg-advice-writing">
        <h3 className="b-subhead">{name}</h3>
        <span role="img" className="wg-advice-rating" aria-label={`별점 ${rating}점 (5점 만점)`}>
          <CellMeter value={rating} max={5} className="wg-advice-rating-cells" />
          <span aria-hidden="true">{`${rating}/5`}</span>
        </span>
        <span className="b-label">{`이탈 위험 ${RISK_LABEL[persona.dropOffRisk]}`}</span>
      </header>
      <div className="wg-advice-reply-body">
        <p className="wg-advice-prose wg-advice-writing">{persona.overall}</p>
        {persona.moments.length > 0 && (
          <ul>
            {persona.moments.map((moment, index) => (
              <li key={`${index}-${moment.quote}`} className="wg-advice-detail">
                <span className="b-label font-medium">{REACTION_LABEL[moment.reaction]}</span>
                <div>
                  <blockquote className="wg-advice-quote">{moment.quote}</blockquote>
                  <p>{moment.comment}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
