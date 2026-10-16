'use client'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="naming-heading" className="text-base font-semibold">
            표기 통일
          </h2>
          <p className="text-sm text-muted-foreground">
            작품에서 쓸 올바른 표기와 피해야 할 표기를 정합니다.
          </p>
        </div>
        {canEdit && <NamingRuleDialog workId={workId} triggerLabel="표기 규칙 추가" />}
      </div>

      {rules.length === 0 ? (
        <EmptyState title="아직 표기 규칙이 없습니다." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>올바른 표기</TableHead>
              <TableHead>잘못된 표기</TableHead>
              <TableHead>메모</TableHead>
              {canEdit && <TableHead className="text-right">관리</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.canonical}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {rule.variants.map((variant) => (
                      <span key={variant} className="rounded-md border px-1.5 py-0.5 text-xs">
                        {variant}
                      </span>
                    ))}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{rule.note}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <NamingRuleDialog workId={workId} triggerLabel="수정" rule={rule} />
                      <ArchiveRuleButton ruleId={rule.id} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
          success: '표기 규칙을 보관했습니다.',
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
          success: '표기 규칙을 저장했습니다.',
        })
      : await runAction(createNamingRuleAction({ workId, ...input }), {
          success: '표기 규칙을 추가했습니다.',
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
