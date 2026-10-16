import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdviceResult } from '@/ai/tasks/direction-advice'
import { cn } from '@/lib/utils'

export type AdviceOptionData = AdviceResult['options'][number]

type AdviceOptionProps = {
  option: AdviceOptionData
  /** Zero-based position of the option in the result. */
  index: number
  recommended: boolean
  /** Why the recommended option was chosen. Shown only on the recommended card. */
  recommendationReason?: string
}

/** One next-arc option: summary, next-chapter beats, threads and characters used, and risk. */
export function AdviceOption({
  option,
  index,
  recommended,
  recommendationReason,
}: AdviceOptionProps) {
  return (
    <Card className={cn(recommended && 'ring-2 ring-primary')}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{`선택지 ${index + 1}`}</span>
          {recommended && <Badge>추천</Badge>}
        </div>
        <CardTitle className="text-base">{option.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p>{option.summary}</p>
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">다음 화 비트</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {option.beats.map((beat, i) => (
              <li key={`${i}-${beat}`}>{beat}</li>
            ))}
          </ol>
        </section>
        <ChipRow label="사용하는 떡밥" items={option.usesThreads} />
        <ChipRow label="등장 인물" items={option.involvedCharacters} />
        <section className="flex flex-col gap-1">
          <h3 className="font-medium">위험</h3>
          <p className="text-muted-foreground">{option.risk || '없음'}</p>
        </section>
        {recommended && recommendationReason && (
          <p className="rounded-lg bg-muted p-3">{`추천 이유: ${recommendationReason}`}</p>
        )}
      </CardContent>
    </Card>
  )
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-medium">{label}</h3>
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
