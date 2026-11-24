import { ArrowUpRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AdviceResult } from '@/ai/tasks/direction-advice'

export type AdviceOptionData = AdviceResult['options'][number]

type AdviceOptionProps = {
  option: AdviceOptionData
  /** Zero-based position of the option in the result. */
  index: number
  recommended: boolean
  /** Why the recommended option was chosen. Shown only on the recommended card. */
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
    <article data-selected={selected} className="b-tools-advice-option">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="b-number" aria-hidden="true">
            {index + 1}
          </span>
          {recommended && <Badge className="bg-leaf text-ink">추천</Badge>}
        </div>
        <h3 className="b-subhead">
          <button
            type="button"
            className="b-tools-option-select"
            aria-label={`선택지 ${index + 1} ${option.title}`}
            aria-pressed={selected}
            onClick={onSelect}
          >
            <span>{option.title}</span>
            <ArrowUpRightIcon className="size-5 shrink-0" aria-hidden="true" />
          </button>
        </h3>
      </header>
      <div className="flex flex-col gap-4 text-sm">
        <p>{option.summary}</p>
        <section className="flex flex-col gap-1.5">
          <h4 className="font-bold">다음 화의 사건</h4>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {option.beats.map((beat, i) => (
              <li key={`${i}-${beat}`}>{beat}</li>
            ))}
          </ol>
        </section>
        <ChipRow label="사용하는 떡밥" items={option.usesThreads} />
        <ChipRow label="등장 인물" items={option.involvedCharacters} />
        <section className="flex flex-col gap-1">
          <h4 className="font-bold">위험</h4>
          <p className="text-muted-foreground">{option.risk || '없음'}</p>
        </section>
        {recommended && recommendationReason && (
          <p className="rounded-lg bg-muted p-3">{`추천 이유: ${recommendationReason}`}</p>
        )}
      </div>
    </article>
  )
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="font-bold">{label}</h4>
      {items.length === 0 ? (
        <p className="text-muted-foreground">없음</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item}>
              <Badge variant="outline">{item}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
