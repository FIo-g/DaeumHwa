'use client'

import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { draftLengthPlan } from '@/lib/draft-length'
import {
  type DraftPlanCard,
  ENDING_DEVICE_LABELS,
  PLAN_TEXT_MAX,
  SCENE_ROLE_LABELS,
} from '@/lib/draft-plan'
import { createDirectiveAction } from '@/server/actions/wiki'

export type PlanEditKind = 'removed' | 'moved'

type DraftPlanCardViewProps = {
  card: DraftPlanCard
  warnings: string[]
  /** True while a plan or a draft is running: every control is held. */
  busy: boolean
  /** The work the kept requests belong to. */
  workId: string
  /** The chapter target now in the input, or null when it is not a valid target. Sets the scene lengths. */
  targetChars?: number | null
  /** Called with the changed card. `edit` is set for a removal or a move; text changes are counted by the panel. */
  onChange(card: DraftPlanCard, edit?: PlanEditKind): void
  /**
   * Called with the author's one-line note and whether it also becomes a lasting request. The
   * panel keeps it only after the target check passes, and asks the server for a new card.
   */
  onRevise(note: string, keep: boolean): void
  onWrite(): void
  /** Called after a request from this card is kept in the ledger, so the panel can recount. */
  onKept?(): void
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
  workId,
  targetChars = null,
  onChange,
  onRevise,
  onWrite,
  onKept,
}: DraftPlanCardViewProps) {
  const [note, setNote] = useState('')
  // Whether the one-line note also becomes a lasting request when the author revises the plan.
  const [keepNote, setKeepNote] = useState(false)
  // Indexes of the suggested requests the author has already kept.
  const [kept, setKept] = useState<number[]>([])
  // Indexes whose create is pending. The ref stops a second click before the state re-renders.
  const keepingRef = useRef(new Set<number>())
  const [keeping, setKeeping] = useState<number[]>([])
  const lastIndex = card.scenes.length - 1
  // Where keyboard focus goes after a move or a removal: the scene moved, or the row that took its place.
  const listRef = useRef<HTMLOListElement>(null)
  const pendingFocus = useRef<{ index: number; label: string } | null>(null)
  // The per-scene length the server will use for the current target (normalizeCard), when there is one.
  const sceneChars =
    targetChars === null ? null : draftLengthPlan(targetChars, card.scenes.length).charsPerScene

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = null
    const row = listRef.current?.children[pending.index]
    if (!row) return
    // The same arrow for the moved scene; the opposite arrow when it sits at an edge; else its textarea.
    const opposite =
      pending.label === '위로' ? '아래로' : pending.label === '아래로' ? '위로' : null
    const labels = opposite ? [pending.label, opposite] : [pending.label]
    const control = labels
      .map((label) => row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`))
      .find((button) => button && !button.disabled)
    ;(control ?? row.querySelector<HTMLTextAreaElement>('textarea'))?.focus()
  }, [card.scenes])

  function setScenes(scenes: DraftPlanCard['scenes'], edit?: PlanEditKind) {
    onChange({ ...card, scenes }, edit)
  }

  function updateSummary(index: number, summary: string) {
    setScenes(card.scenes.map((scene, i) => (i === index ? { ...scene, summary } : scene)))
  }

  function remove(index: number) {
    const rest = card.scenes.filter((_, i) => i !== index)
    // Keep the chapter target: the remaining scenes share the current target, as normalizeCard does.
    const total = targetChars ?? card.scenes.reduce((sum, scene) => sum + scene.targetChars, 0)
    const perScene = draftLengthPlan(total, rest.length).charsPerScene
    pendingFocus.current = { index: Math.min(index, rest.length - 1), label: '빼기' }
    setScenes(
      rest.map((scene) => ({ ...scene, targetChars: perScene })),
      'removed',
    )
  }

  function move(index: number, to: number) {
    const scenes = [...card.scenes]
    ;[scenes[index], scenes[to]] = [scenes[to], scenes[index]]
    pendingFocus.current = { index: to, label: to > index ? '아래로' : '위로' }
    setScenes(scenes, 'moved')
  }

  /** Keeps one suggested request in the ledger. A failure shows its toast; the plan is never held up by it. */
  async function keepSuggestion(text: string, index: number) {
    if (keepingRef.current.has(index) || kept.includes(index)) return
    keepingRef.current.add(index)
    setKeeping([...keepingRef.current])
    const row = await runAction(
      createDirectiveAction({ workId, scope: 'work', kind: 'content', text, source: 'suggested' }),
    )
    keepingRef.current.delete(index)
    setKeeping([...keepingRef.current])
    if (!row) return
    setKept((prev) => [...prev, index])
    onKept?.()
  }

  function revise() {
    onRevise(note.trim(), keepNote)
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

      <ol ref={listRef} className="grid gap-3">
        {card.scenes.map((scene, index) => (
          <li key={index} className="grid gap-2 rounded-md bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {`장면 ${index + 1} · ${SCENE_ROLE_LABELS[scene.role]} · 약 ${(sceneChars ?? scene.targetChars).toLocaleString('ko-KR')}자`}
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

      {(card.requests ?? []).length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">계속 지킬 요청으로 보이는 것</p>
          <ul className="grid gap-2">
            {(card.requests ?? []).map((request, index) => (
              <li key={index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1">{request}</span>
                {kept.includes(index) ? (
                  <span className="shrink-0 text-xs text-muted-foreground">장부에 넣었습니다</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || keeping.includes(index)}
                    onClick={() => void keepSuggestion(request, index)}
                  >
                    앞으로도 지키기
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
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
        <Button variant="outline" disabled={busy || note.trim() === ''} onClick={revise}>
          다시 계획
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="plan-keep-note"
          checked={keepNote}
          disabled={busy}
          onCheckedChange={(checked) => setKeepNote(checked)}
        />
        <Label htmlFor="plan-keep-note">앞으로도 이렇게</Label>
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
