'use client'

import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { draftLengthPlan } from '@/lib/draft-length'
import {
  type DraftPlanCard,
  ENDING_DEVICE_LABELS,
  PLAN_TEXT_MAX,
  SCENE_ROLE_LABELS,
} from '@/lib/draft-plan'

export type PlanEditKind = 'removed' | 'moved' | 'textEdits'

type DraftPlanCardViewProps = {
  card: DraftPlanCard
  warnings: string[]
  /** True while a plan or a draft is running: every control is held. */
  busy: boolean
  /** Called with the changed card. `edit` is set for a removal, a move or a finished text edit. */
  onChange(card: DraftPlanCard, edit?: PlanEditKind): void
  /** Called with the author's one-line note; the panel asks the server for a new card. */
  onRevise(note: string): void
  onWrite(): void
}

const REVISION_PLACEHOLDER = '계획을 한 줄로 고쳐 주세요 (예: 2장면에서 윤서가 먼저 말을 걸게)'

/**
 * The chapter plan card (stage 1): one block per scene, editable only in its summary. The author
 * removes or moves scenes, asks for a new plan with one line, or writes the chapter from the card.
 */
export function DraftPlanCardView({
  card,
  warnings,
  busy,
  onChange,
  onRevise,
  onWrite,
}: DraftPlanCardViewProps) {
  const [note, setNote] = useState('')
  // The summary as it was when its textarea got focus. A text edit is counted once, on blur.
  const focused = useRef<{ index: number; before: string } | null>(null)
  const lastIndex = card.scenes.length - 1

  function setScenes(scenes: DraftPlanCard['scenes'], edit?: PlanEditKind) {
    onChange({ ...card, scenes }, edit)
  }

  function updateSummary(index: number, summary: string) {
    setScenes(card.scenes.map((scene, i) => (i === index ? { ...scene, summary } : scene)))
  }

  function remove(index: number) {
    const rest = card.scenes.filter((_, i) => i !== index)
    // Keep the chapter target: the remaining scenes share the total of the removed card.
    const total = card.scenes.reduce((sum, scene) => sum + scene.targetChars, 0)
    const perScene = draftLengthPlan(total, rest.length).charsPerScene
    setScenes(
      rest.map((scene) => ({ ...scene, targetChars: perScene })),
      'removed',
    )
  }

  function move(index: number, to: number) {
    const scenes = [...card.scenes]
    ;[scenes[index], scenes[to]] = [scenes[to], scenes[index]]
    setScenes(scenes, 'moved')
  }

  function finishTextEdit(index: number) {
    const start = focused.current
    focused.current = null
    if (start && start.index === index && card.scenes[index].summary !== start.before) {
      onChange(card, 'textEdits')
    }
  }

  return (
    <section aria-label="이번 화 계획" className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">이번 화 계획</h3>
        {warnings.map((warning) => (
          <p key={warning} className="text-xs text-muted-foreground">
            {warning}
          </p>
        ))}
      </div>

      <ol className="grid gap-3">
        {card.scenes.map((scene, index) => (
          <li key={index} className="grid gap-2 rounded-md bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {`장면 ${index + 1} · ${SCENE_ROLE_LABELS[scene.role]} · 약 ${scene.targetChars.toLocaleString('ko-KR')}자`}
              </p>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="위로"
                  disabled={busy || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="아래로"
                  disabled={busy || index === lastIndex}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="빼기"
                  disabled={busy || card.scenes.length === 1}
                  onClick={() => remove(index)}
                >
                  <XIcon />
                </Button>
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor={`plan-summary-${index}`}>일어나는 일</Label>
              <Textarea
                id={`plan-summary-${index}`}
                value={scene.summary}
                rows={2}
                maxLength={PLAN_TEXT_MAX}
                disabled={busy}
                onFocus={() => {
                  focused.current = { index, before: scene.summary }
                }}
                onBlur={() => finishTextEdit(index)}
                onChange={(event) => updateSummary(index, event.target.value)}
              />
            </div>

            <dl className="grid gap-1 text-sm">
              <PlanRow label="목표" value={scene.goal} />
              <PlanRow label="결정" value={scene.decision} />
              <PlanRow label="대가" value={scene.stake} />
              <PlanRow label="감정의 계기" value={scene.trigger} />
              <PlanRow label="장소" value={scene.place} />
              <PlanRow label="인물" value={scene.characters.join(', ')} />
            </dl>
          </li>
        ))}
      </ol>

      <p className="text-sm">
        {`회차 끝 (${ENDING_DEVICE_LABELS[card.ending.device]}): ${card.ending.line}`}
      </p>
      {card.threads.length > 0 && (
        <p className="text-sm">{`움직일 떡밥: ${card.threads.join(', ')}`}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="계획 고치는 말"
          className="min-w-0 flex-1"
          placeholder={REVISION_PLACEHOLDER}
          value={note}
          maxLength={300}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={busy || note.trim() === ''}
          onClick={() => onRevise(note.trim())}
        >
          다시 계획
        </Button>
      </div>

      <div>
        <Button disabled={busy} onClick={onWrite}>
          이 계획으로 쓰기
        </Button>
      </div>
    </section>
  )
}

/** One labelled row of a scene. An empty value is left out. */
function PlanRow({ label, value }: { label: string; value: string }) {
  if (value.trim() === '') return null
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
