'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useState } from 'react'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { SubmitButton } from '@/components/app/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ThreadEventKind, ThreadStatus } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { THREAD_EVENT_LABEL } from '@/lib/labels'
import { addThreadEventAction } from '@/server/actions/threads'
import type { ChapterOption, ThreadItem } from './thread-types'

/** Record kinds that can follow the thread's current status. The server applies the same rules. */
export function allowedEventKinds(status: ThreadStatus): ThreadEventKind[] {
  switch (status) {
    case 'planned':
      return ['planted', 'discarded', 'note']
    case 'planted':
    case 'developing':
      return ['developed', 'resolved', 'discarded', 'note']
    case 'resolved':
    case 'discarded':
      return ['note']
  }
}

/** Kinds that do not need a chapter. The chapter picker offers 없음 for them. */
function chapterIsOptional(kind: ThreadEventKind): boolean {
  return kind === 'note' || kind === 'discarded'
}

type ThreadEventFormProps = {
  thread: ThreadItem
  chapters: ChapterOption[]
  onDone?: () => void
}

/**
 * Adds one timeline record to a thread and moves its status. Service errors (for example
 * 회수 before the planting chapter) are shown inline below the form.
 */
export function ThreadEventForm({ thread, chapters, onDone }: ThreadEventFormProps) {
  const router = useRouter()
  const ids = useId()
  const kinds = allowedEventKinds(thread.status)
  const latestChapterId = chapters.length > 0 ? chapters[chapters.length - 1].id : null

  const [pickedKind, setPickedKind] = useState<ThreadEventKind>(kinds[0])
  // A status change can make the picked kind invalid; fall back to the first allowed kind.
  const kind = kinds.includes(pickedKind) ? pickedKind : kinds[0]
  const [chapterId, setChapterId] = useState<string | null>(latestChapterId)
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const saved = await runAction(
        addThreadEventAction({
          threadId: thread.id,
          kind,
          chapterId: kind === 'note' ? null : chapterId,
          note,
          evidence,
        }).then((result) => {
          if (!result.ok) setError(result.error.message)
          return result
        }),
        { success: '기록을 남겼습니다.' },
      )
      if (saved) {
        setNote('')
        setEvidence('')
        router.refresh()
        onDone?.()
      }
    } finally {
      setPending(false)
    }
  }

  const chapterLabelId = `${ids}-chapter`
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-kind`}>기록 종류</Label>
          <Select
            value={kind}
            onValueChange={(next) => {
              if (next) setPickedKind(next as ThreadEventKind)
            }}
          >
            <SelectTrigger id={`${ids}-kind`} className="w-full">
              <SelectValue>
                {(selected: string | null) =>
                  selected ? THREAD_EVENT_LABEL[selected as ThreadEventKind] : ''
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {THREAD_EVENT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div role="group" aria-labelledby={chapterLabelId} className="flex flex-col gap-1.5">
          <Label id={chapterLabelId}>회차</Label>
          <ChapterPicker
            chapters={chapters}
            value={chapterId}
            onChange={setChapterId}
            allowNone={chapterIsOptional(kind)}
            placeholder="회차 선택"
            ariaLabel="회차"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-note`}>메모</Label>
        <Textarea
          id={`${ids}-note`}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-evidence`}>근거</Label>
        <Input
          id={`${ids}-evidence`}
          value={evidence}
          maxLength={2000}
          placeholder="근거가 된 문장 (선택)"
          onChange={(e) => setEvidence(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <SubmitButton pending={pending}>기록 추가</SubmitButton>
      </div>
    </form>
  )
}
