import type { ReactNode } from 'react'

const STAGES = ['올리기', '나누기', '설정 추출', '승인 대기']

export function ImportStages({ stage, children }: { stage: 1 | 2 | 3 | 4; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5">
      <ol aria-label="가져오기 단계" className="wg-import-stages">
        {STAGES.map((label, index) => {
          const number = index + 1
          const active = number === stage
          return (
            <li
              key={label}
              className="wg-import-stage"
              data-state={active ? 'current' : number < stage ? 'past' : 'next'}
              aria-current={active ? 'step' : undefined}
            >
              <h2>{label}</h2>
              {number < stage && <span role="img" aria-label="지난 단계" className="sr-only" />}
            </li>
          )
        })}
      </ol>
      <div key={stage} className="wg-import-stage-content">
        {children}
      </div>
    </div>
  )
}

export function ImportMeter({
  completed,
  total,
  label,
}: {
  completed: number
  total: number
  label: string
}) {
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <div
      className="wg-import-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <CellStrip filled={completed} count={total} />
    </div>
  )
}

export function CellStrip({ filled, count }: { filled: number; count: number }) {
  return (
    <div aria-hidden="true" className="wg-import-cells">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} data-filled={index < filled || undefined} />
      ))}
    </div>
  )
}
