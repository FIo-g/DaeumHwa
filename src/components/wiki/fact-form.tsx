'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
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
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
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
            }),
            { success: '사실을 추가했습니다.' },
          )
        : fact
          ? await runAction(
              updateFactAction({
                factId: fact.id,
                content,
                status,
                sourceChapterId: chapterId,
                evidence,
              }),
              { success: '사실을 고쳤습니다.' },
            )
          : null
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fact-content">사실 내용</Label>
        <Textarea
          id="fact-content"
          required
          maxLength={2000}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">태그</span>
        <FactStatusSelect value={status} onChange={setStatus} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="fact-source-label" className="text-sm font-medium">
          출처 회차
        </span>
        <div role="group" aria-labelledby="fact-source-label">
          <ChapterPicker chapters={chapters} value={chapterId} onChange={setChapterId} allowNone />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
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
      success: '태그를 바꿨습니다.',
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>태그 바꾸기</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FactStatusSelect value={picked} onChange={setPicked} />
          <DialogFooter>
            <SubmitButton pending={pending}>저장</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
