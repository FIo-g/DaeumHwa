import { CheckIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { AdviceResult } from '@/ai/tasks/direction-advice'

export type AdviceOptionData = AdviceResult['options'][number]

type AdviceOptionProps = {
  option: AdviceOptionData
  /** Zero-based position of the option in the result. */
  index: number
  recommended: boolean
  /** Why the recommended option was chosen. */
  recommendationReason?: string
  selected: boolean
  onSelect: () => void
}

/** One next-arc option: summary, next-chapter beats, threads and characters used, and risk. */
export function AdviceOption({
  option,
  index,
  recommended,
  recommendationReason,
  selected,
  onSelect,
}: AdviceOptionProps) {
  return (
    <article
      data-selected={selected}
      className="wg-advice-row wg-advice-reply"
      style={{ '--wg-advice-row': Math.min(index, 3) } as CSSProperties}
    >
      <div className="wg-advice-gutter" aria-hidden="true">
        <span className="wg-advice-option-number">{index + 1}</span>
        {selected && <CheckIcon className="wg-advice-check" strokeWidth={1.5} />}
      </div>
      <header className="wg-advice-reply-heading wg-advice-writing">
        <h3 className="b-subhead">
          <button
            type="button"
            className="wg-advice-option-select"
            aria-label={`선택지 ${index + 1} ${option.title}`}
            aria-pressed={selected}
            onClick={onSelect}
          >
            {option.title}
          </button>
        </h3>
        {recommended && <span className="wg-advice-recommended b-label">추천</span>}
      </header>
      <div className="wg-advice-reply-body">
        <p className="wg-advice-prose wg-advice-writing">{option.summary}</p>
        <AdviceDetail label="다음 화의 사건">
          <ol className="grid list-decimal gap-1 ps-4">
            {option.beats.map((beat, i) => (
              <li key={`${i}-${beat}`}>{beat}</li>
            ))}
          </ol>
        </AdviceDetail>
        <DetailList label="사용하는 떡밥" items={option.usesThreads} />
        <DetailList label="등장 인물" items={option.involvedCharacters} />
        <AdviceDetail label="위험">
          <p>{option.risk || '없음'}</p>
        </AdviceDetail>
        {recommended && recommendationReason && (
          <p className="wg-advice-detail wg-advice-reason">{`추천 이유: ${recommendationReason}`}</p>
        )}
      </div>
    </article>
  )
}

function AdviceDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="wg-advice-detail">
      <h4 className="b-label font-medium">{label}</h4>
      {children}
    </section>
  )
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  return (
    <AdviceDetail label={label}>
      {items.length === 0 ? (
        <p className="b-muted">없음</p>
      ) : (
        <ul className="wg-advice-detail-items">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </AdviceDetail>
  )
}
