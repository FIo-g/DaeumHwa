'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { FactStatusSelect } from '@/components/app/fact-status-select'
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
import { Textarea } from '@/components/ui/textarea'
import type { FactStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { createFactAction, updateFactAction } from '@/server/actions/wiki'

export type FactChapterOption = { id: string; position: number; title: string }

export type EditableFact = {
  id: string
  content: string
  status: FactStatus
  sourceChapterId: string | null
  evidence: string
  revealAtPosition?: number | null
  validFromPosition?: number | null
  validToPosition?: number | null
}

type FactFormDialogProps = {
  workId: string
  mode: 'create' | 'edit'
  /** Required in create mode: the card the new fact belongs to. */
  entryId?: string
  chapters: FactChapterOption[]
  fact?: EditableFact
  triggerLabel: string
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost'
  triggerSize?: 'default' | 'sm'
}

/** Dialog that adds a fact to a card, or edits the content, tag, source chapter and evidence of one. */
export function FactFormDialog({
  workId,
  mode,
  entryId,
  chapters,
  fact,
  triggerLabel,
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: FactFormDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '사실 추가' : '사실 수정'}</DialogTitle>
        </DialogHeader>
        <FactFormFields
          workId={workId}
          mode={mode}
          entryId={entryId}
          chapters={chapters}
          fact={fact}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function FactFormFields({
  workId,
  mode,
  entryId,
  chapters,
  fact,
  onDone,
}: Omit<FactFormDialogProps, 'triggerLabel' | 'triggerVariant' | 'triggerSize'> & {
  onDone: () => void
}) {
  const router = useRouter()
  const [content, setContent] = useState(fact?.content ?? '')
  const [status, setStatus] = useState<FactStatus>(fact?.status ?? 'confirmed')
  const [chapterId, setChapterId] = useState<string | null>(fact?.sourceChapterId ?? null)
  const [evidence, setEvidence] = useState(fact?.evidence ?? '')
  const [reveal, setReveal] = useState(fact?.revealAtPosition ? String(fact.revealAtPosition) : '')
  const [validFrom, setValidFrom] = useState(
    fact?.validFromPosition !== null && fact?.validFromPosition !== undefined
      ? String(fact.validFromPosition)
      : '',
  )
  const [validTo, setValidTo] = useState(
    fact?.validToPosition !== null && fact?.validToPosition !== undefined
      ? String(fact.validToPosition)
      : '',
  )
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validFromPosition = validFrom.trim() === '' ? null : Number(validFrom)
    const validToPosition = validTo.trim() === '' ? null : Number(validTo)
    const storedFromPosition = fact?.validFromPosition ?? null
    const storedToPosition = fact?.validToPosition ?? null
    const fromChanged = mode === 'edit' && validFromPosition !== storedFromPosition
    const toChanged = mode === 'edit' && validToPosition !== storedToPosition
    const changedPositions =
      mode === 'create'
        ? [validFromPosition, validToPosition]
        : [...(fromChanged ? [validFromPosition] : []), ...(toChanged ? [validToPosition] : [])]
    if (changedPositions.some((p) => p !== null && (!Number.isInteger(p) || p < 1))) {
      toast.error('유효 회차는 1 이상으로 적어 주세요.')
      return
    }
    const nextFromPosition =
      mode === 'create' ? validFromPosition : fromChanged ? validFromPosition : storedFromPosition
    const nextToPosition =
      mode === 'create' ? validToPosition : toChanged ? validToPosition : storedToPosition
    if (
      (mode === 'create' || fromChanged || toChanged) &&
      nextFromPosition !== null &&
      nextToPosition !== null &&
      nextToPosition < nextFromPosition
    ) {
      toast.error('끝 회차는 시작 회차보다 앞설 수 없어요.')
      return
    }
    // On edit, send a range key only when the author changed it. An old superseded fact may store
    // an end of 0, which the author cannot fix from a content-only edit.
    const range =
      mode === 'create'
        ? { validFromPosition, validToPosition }
        : {
            ...(fromChanged ? { validFromPosition } : {}),
            ...(toChanged ? { validToPosition } : {}),
          }
    setPending(true)
    const revealAtPosition = reveal.trim() === '' ? null : Number(reveal)
    const saved =
      mode === 'create'
        ? await runAction(
            createFactAction({
              workId,
              entryId: entryId ?? null,
              content,
              status,
              sourceType: chapterId ? 'chapter' : 'author',
              sourceChapterId: chapterId,
              evidence,
              revealAtPosition,
              ...range,
            }),
            { success: '사실을 추가했어요.' },
          )
        : fact
          ? await runAction(
              updateFactAction({
                factId: fact.id,
                content,
                status,
                sourceChapterId: chapterId,
                evidence,
                revealAtPosition,
                ...range,
              }),
              { success: '사실을 고쳤어요.' },
            )
          : null
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="wg-wiki-form">
      <div className="wg-wiki-form-row">
        <Label htmlFor="fact-content">사실 내용</Label>
        <Textarea
          id="fact-content"
          className="b-manuscript"
          required
          maxLength={2000}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="wg-wiki-form-row">
        <span className="b-label font-medium">태그</span>
        <FactStatusSelect value={status} onChange={setStatus} />
      </div>
      <div className="wg-wiki-form-row">
        <span id="fact-source-label" className="b-label font-medium">
          출처 회차
        </span>
        <div role="group" aria-labelledby="fact-source-label">
          <ChapterPicker chapters={chapters} value={chapterId} onChange={setChapterId} allowNone />
        </div>
      </div>
      <div className="wg-wiki-form-row">
        <Label htmlFor="fact-reveal">공개 회차</Label>
        <Input
          id="fact-reveal"
          type="number"
          min={1}
          step={1}
          value={reveal}
          onChange={(e) => setReveal(e.target.value)}
        />
        <p className="wg-wiki-form-hint">이 회차 전에는 AI 초안에 넣지 않아요.</p>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="fact-valid-from">유효 시작 회차</Label>
            <Input
              id="fact-valid-from"
              type="number"
              step={1}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="fact-valid-to">유효 끝 회차</Label>
            <Input
              id="fact-valid-to"
              type="number"
              step={1}
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </div>
        </div>
        <p className="b-muted text-xs">빈칸은 처음부터 끝까지 적용돼요.</p>
      </div>
      <div className="wg-wiki-form-row">
        <Label htmlFor="fact-evidence">근거 문장</Label>
        <Input
          id="fact-evidence"
          maxLength={2000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </div>
      <DialogFooter>
        <SubmitButton pending={pending}>저장</SubmitButton>
      </DialogFooter>
    </form>
  )
}

/** Dialog that only changes the tag (확정 / 가정 / 미정) of a fact. */
export function FactTagDialog({
  factId,
  status,
  triggerLabel = '태그 바꾸기',
}: {
  factId: string
  status: FactStatus
  triggerLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<FactStatus>(status)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const saved = await runAction(updateFactAction({ factId, status: picked }), {
      success: '태그를 바꿨어요.',
    })
    setPending(false)
    if (saved) {
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Start from the saved tag each time the dialog opens.
        if (next) setPicked(status)
        setOpen(next)
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>태그 바꾸기</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="wg-wiki-form">
          <FactStatusSelect value={picked} onChange={setPicked} />
          <DialogFooter>
            <SubmitButton pending={pending}>저장</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
