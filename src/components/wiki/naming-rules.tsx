'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
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

/** Table of correct spellings and the wrong spellings to avoid. */
export function NamingRules({ workId, rules, canEdit }: NamingRulesProps) {
  return (
    <section aria-labelledby="naming-heading" className="flex flex-col gap-4">
      <div className="b-wiki-toolbar">
        <div className="flex flex-col gap-1">
          <h2 id="naming-heading" className="b-wiki-section-title">
            표기 통일
          </h2>
          <p className="text-sm text-muted-foreground">작품에서 쓸 표기와 피할 표기를 정해요.</p>
        </div>
        {canEdit && <NamingRuleDialog workId={workId} triggerLabel="표기 규칙 추가" />}
      </div>

      {rules.length === 0 ? (
        <EmptyState title="아직 표기 규칙이 없어요." />
      ) : (
        <ul className="b-wiki-records">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="flex flex-col gap-3 p-4"
              style={{ '--b-i': Math.min(index, 5) } as CSSProperties}
            >
              <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
                <div>
                  <dt className="b-label b-muted">올바른 표기</dt>
                  <dd className="b-row__title">{rule.canonical}</dd>
                </div>
                <div>
                  <dt className="b-label b-muted">잘못된 표기</dt>
                  <dd className="flex flex-wrap gap-1">
                    {rule.variants.map((variant) => (
                      <span key={variant} className="b-wiki-tag">
                        {variant}
                      </span>
                    ))}
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
                <div className="flex flex-wrap gap-2">
                  <NamingRuleDialog workId={workId} triggerLabel="수정" rule={rule} />
                  <ArchiveRuleButton ruleId={rule.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ArchiveRuleButton({ ruleId }: { ruleId: string }) {
  const router = useRouter()
  return (
    <ConfirmButton
      title="이 표기 규칙을 보관할까요?"
      confirmLabel="보관"
      size="sm"
      onConfirm={async () => {
        const saved = await runAction(archiveNamingRuleAction({ ruleId }), {
          success: '표기 규칙을 보관했어요.',
        })
        if (saved) router.refresh()
      }}
    >
      보관
    </ConfirmButton>
  )
}

/** Dialog that creates a naming rule, or edits one when `rule` is given. */
function NamingRuleDialog({
  workId,
  triggerLabel,
  rule,
}: {
  workId: string
  triggerLabel: string
  rule?: NamingRuleItem
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? '표기 규칙 수정' : '표기 규칙 추가'}</DialogTitle>
        </DialogHeader>
        <NamingRuleFields workId={workId} rule={rule} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="naming-canonical">올바른 표기</Label>
        <Input
          id="naming-canonical"
          required
          maxLength={100}
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="naming-variants">잘못된 표기 (쉼표로 구분)</Label>
        <Input
          id="naming-variants"
          maxLength={500}
          value={variants}
          onChange={(e) => setVariants(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="naming-note">메모</Label>
        <Input
          id="naming-note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <DialogFooter>
        <SubmitButton pending={pending}>저장</SubmitButton>
      </DialogFooter>
    </form>
  )
}
