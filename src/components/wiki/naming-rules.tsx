'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useRef, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { Disclosure } from '@/components/motion'
import { SubmitButton } from '@/components/app/submit-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { runAction } from '@/lib/client/run-action'
import {
  archiveNamingRuleAction,
  createNamingRuleAction,
  updateNamingRuleAction,
} from '@/server/actions/wiki'

export type NamingRuleItem = {
  id: string
  canonical: string
  variants: string[]
  note: string
}

type NamingRulesProps = {
  workId: string
  rules: NamingRuleItem[]
  canEdit: boolean
}

/** Keep a confirmed archive visible until its exit animation finishes. */
export function useWikiTabArchive<T extends { id: string }>(items: T[]) {
  const router = useRouter()
  const [held, setHeld] = useState<{ item: T; index: number }[]>([])
  const rows = [...items]
  for (const { item, index } of held) {
    if (!rows.some(({ id }) => id === item.id)) rows.splice(index, 0, item)
  }

  async function archive(item: T, row: HTMLElement | null, save: () => Promise<unknown>) {
    const index = rows.findIndex(({ id }) => id === item.id)
    setHeld((current) => [...current, { item, index }])
    const release = () =>
      setHeld((current) => current.filter(({ item: held }) => held.id !== item.id))
    try {
      if (!(await save())) {
        release()
        return
      }
      if (row) row.dataset.wgWikiTabsRemoving = ''
      const fold = row
        ?.getAnimations?.()
        .find(
          (animation) =>
            'animationName' in animation && animation.animationName === 'wg-wiki-tabs-fold',
        )
      if (fold) void fold.finished.then(release, release)
      else release()
      router.refresh()
    } catch (error) {
      release()
      throw error
    }
  }

  return { rows, archive }
}

export function NamingRules({ workId, rules, canEdit }: NamingRulesProps) {
  const { rows, archive } = useWikiTabArchive(rules)
  const [adding, setAdding] = useState(false)
  const addRow = useRef<HTMLDivElement>(null)

  return (
    <section aria-labelledby="naming-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="naming-heading" className="wg-wiki-section-title">
          표기 통일
        </h2>
        <p className="b-label b-muted">작품에서 쓸 표기와 피할 표기를 정해요.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="아직 표기 규칙이 없어요." />
      ) : (
        <ul className="wg-wiki-tabs-list">
          {rows.map((rule, index) => (
            <NamingRuleRow
              key={rule.id}
              workId={workId}
              rule={rule}
              canEdit={canEdit}
              index={index}
              archive={(row) =>
                archive(rule, row, () =>
                  runAction(archiveNamingRuleAction({ ruleId: rule.id }), {
                    success: '표기 규칙을 보관했어요.',
                  }),
                )
              }
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <div ref={addRow} className="wg-wiki-tabs-add">
          <Disclosure title="표기 규칙 추가" open={adding} onOpenChange={setAdding}>
            {adding && (
              <NamingRuleFields
                workId={workId}
                onDone={() => {
                  addRow.current?.querySelector('button')?.focus()
                  setAdding(false)
                }}
              />
            )}
          </Disclosure>
        </div>
      )}
    </section>
  )
}

function NamingRuleRow({
  workId,
  rule,
  canEdit,
  index,
  archive,
}: {
  workId: string
  rule: NamingRuleItem
  canEdit: boolean
  index: number
  archive: (row: HTMLLIElement | null) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  return (
    <li
      ref={row}
      className="wg-wiki-tabs-row wg-wiki-tabs-naming"
      tabIndex={0}
      style={{ '--wg-wiki-tabs-order': Math.min(index, 2) } as CSSProperties}
    >
      <span className="wg-wiki-tabs-number" aria-hidden="true" />
      <dl
        key={JSON.stringify([rule.canonical, rule.variants, rule.note])}
        className="wg-wiki-tabs-naming-fields wg-wiki-tabs-write"
      >
        <div>
          <dt className="b-label b-muted">올바른 표기</dt>
          <dd className="font-heading text-lg font-bold">{rule.canonical}</dd>
        </div>
        <div>
          <dt className="b-label b-muted">잘못된 표기</dt>
          <dd className="flex items-baseline gap-2">
            {rule.variants.length > 0 && <span aria-hidden="true">←</span>}
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
              {rule.variants.map((variant, index) => (
                <s key={index} className="wg-wiki-tabs-variant">
                  {variant}
                </s>
              ))}
            </div>
          </dd>
        </div>
        {rule.note && (
          <div>
            <dt className="b-label b-muted">메모</dt>
            <dd>{rule.note}</dd>
          </div>
        )}
      </dl>
      {canEdit && (
        <div className="wg-wiki-tabs-actions">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="link" size="sm" />}>수정</DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>표기 규칙 수정</DialogTitle>
              </DialogHeader>
              <NamingRuleFields workId={workId} rule={rule} onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          <ConfirmButton
            title="이 표기 규칙을 보관할까요?"
            confirmLabel="보관"
            variant="link"
            size="sm"
            onConfirm={() => archive(row.current)}
          >
            보관
          </ConfirmButton>
        </div>
      )}
    </li>
  )
}

function NamingRuleFields({
  workId,
  rule,
  onDone,
}: {
  workId: string
  rule?: NamingRuleItem
  onDone: () => void
}) {
  const router = useRouter()
  const id = useId()
  const [canonical, setCanonical] = useState(rule?.canonical ?? '')
  const [variants, setVariants] = useState((rule?.variants ?? []).join(', '))
  const [note, setNote] = useState(rule?.note ?? '')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = {
      canonical: canonical.trim(),
      variants: variants
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== ''),
      note: note.trim(),
    }
    setPending(true)
    const saved = rule
      ? await runAction(updateNamingRuleAction({ ruleId: rule.id, ...input }), {
          success: '표기 규칙을 저장했어요.',
        })
      : await runAction(createNamingRuleAction({ workId, ...input }), {
          success: '표기 규칙을 추가했어요.',
        })
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className={rule ? 'flex flex-col gap-4' : 'wg-wiki-tabs-add-fields'}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-canonical`}>올바른 표기</Label>
        <Input
          id={`${id}-canonical`}
          required
          maxLength={100}
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-variants`}>잘못된 표기 (쉼표로 구분)</Label>
        <Input
          id={`${id}-variants`}
          maxLength={500}
          value={variants}
          onChange={(e) => setVariants(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>메모</Label>
        <Input
          id={`${id}-note`}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {rule ? (
        <DialogFooter>
          <SubmitButton pending={pending}>저장</SubmitButton>
        </DialogFooter>
      ) : (
        <SubmitButton pending={pending}>저장</SubmitButton>
      )}
    </form>
  )
}
