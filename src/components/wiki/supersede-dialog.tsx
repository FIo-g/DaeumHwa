'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { FactStatusSelect } from '@/components/app/fact-status-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { supersedeFactAction } from '@/server/actions/wiki'
import type { FactChapterOption } from './fact-form'

type SupersedeDialogProps = {
  fact: { id: string; content: string; status: FactStatus }
  chapters: FactChapterOption[]
}

/** Records that a fact stops being true from a chapter on, and what replaces it. */
export function SupersedeDialog({ fact, chapters }: SupersedeDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        특정 회차부터 바뀜
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>특정 회차부터 바뀜</DialogTitle>
          <DialogDescription>
            기존 사실은 그 전 회차까지만 유효하게 남고, 새 사실이 그 회차부터 유효해집니다.
          </DialogDescription>
        </DialogHeader>
        <SupersedeFields fact={fact} chapters={chapters} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SupersedeFields({
  fact,
  chapters,
  onDone,
}: SupersedeDialogProps & { onDone: () => void }) {
  const router = useRouter()
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<FactStatus>('confirmed')
  const [evidence, setEvidence] = useState('')
  const [pending, setPending] = useState(false)

  const chapter = chapters.find((c) => c.id === chapterId)
  const canSave = chapter !== undefined && content.trim() !== ''

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chapter) return
    setPending(true)
    const saved = await runAction(
      supersedeFactAction({
        factId: fact.id,
        fromPosition: chapter.position,
        content,
        status,
        evidence,
        sourceChapterId: chapter.id,
        sourceType: 'chapter',
      }),
      { success: '바뀐 사실을 기록했습니다.' },
    )
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">기존 사실: {fact.content}</p>
      <div className="flex flex-col gap-1.5">
        <span id="supersede-chapter-label" className="text-sm font-medium">
          바뀌는 회차
        </span>
        <div role="group" aria-labelledby="supersede-chapter-label">
          <ChapterPicker chapters={chapters} value={chapterId} onChange={setChapterId} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supersede-content">바뀐 내용</Label>
        <Textarea
          id="supersede-content"
          rows={3}
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">태그</span>
        <FactStatusSelect value={status} onChange={setStatus} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supersede-evidence">근거 문장</Label>
        <Input
          id="supersede-evidence"
          maxLength={2000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !canSave}>
          기록하기
        </Button>
      </DialogFooter>
    </form>
  )
}
