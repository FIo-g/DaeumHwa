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
import { SCHEDULE_KINDS, type ScheduleKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { SCHEDULE_KIND_LABEL } from '@/lib/labels'
import { createScheduleItemAction, updateScheduleItemAction } from '@/server/actions/schedule'
import type { ScheduleItemView } from './schedule-item-list'

type ScheduleItemFormProps = {
  workId: string
  /** Default start date (today in Seoul). */
  today: string
  chapters: { id: string; position: number; title: string }[]
  /** When given, the form edits this item instead of adding a new one. */
  item?: ScheduleItemView
  onDone?: () => void
}

/** Adds a schedule item or edits an existing one: deadline, publish, hiatus, or other event. Editor only. */
export function ScheduleItemForm({ workId, today, chapters, item, onDone }: ScheduleItemFormProps) {
  const router = useRouter()
  const formId = useId()
  const fieldId = (name: string) => `${formId}-${name}`
  const [kind, setKind] = useState<ScheduleKind>(item?.kind ?? 'deadline')
  const [title, setTitle] = useState(item?.title ?? '')
  const [date, setDate] = useState(item?.date ?? today)
  const [endDate, setEndDate] = useState(item?.endDate ?? '')
  const [chapterId, setChapterId] = useState<string | null>(item?.chapterId ?? null)
  const [note, setNote] = useState(item?.note ?? '')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      const resolvedEndDate = kind === 'hiatus' && endDate ? endDate : null
      const saved = item
        ? await runAction(
            updateScheduleItemAction({
              itemId: item.id,
              kind,
              title,
              date,
              endDate: resolvedEndDate,
              chapterId,
              note,
            }),
            { success: '일정을 고쳤어요.' },
          )
        : await runAction(
            createScheduleItemAction({
              workId,
              kind,
              title,
              date,
              endDate: resolvedEndDate,
              chapterId,
              note,
            }),
            { success: '일정을 추가했어요.' },
          )
      if (saved) {
        if (item) {
          onDone?.()
        } else {
          setTitle('')
          setEndDate('')
          setChapterId(null)
          setNote('')
        }
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId('kind')}>종류</Label>
        <Select
          value={kind}
          onValueChange={(next) => {
            if (next) setKind(next as ScheduleKind)
          }}
        >
          <SelectTrigger id={fieldId('kind')} className="w-full">
            <SelectValue>
              {(value: string | null) => SCHEDULE_KIND_LABEL[value as ScheduleKind] ?? ''}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {SCHEDULE_KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId('title')}>제목</Label>
        <Input
          id={fieldId('title')}
          value={title}
          maxLength={100}
          placeholder={SCHEDULE_KIND_LABEL[kind]}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId('date')}>{kind === 'hiatus' ? '시작일' : '날짜'}</Label>
        <Input
          id={fieldId('date')}
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {kind === 'hiatus' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId('end-date')}>
            끝나는 날 <span className="b-tools-field-cue" aria-hidden="true" />
          </Label>
          <Input
            id={fieldId('end-date')}
            type="date"
            value={endDate}
            min={date}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId('chapter')}>회차</Label>
        <ChapterPicker
          id={fieldId('chapter')}
          chapters={chapters}
          value={chapterId}
          onChange={setChapterId}
          allowNone
          placeholder="회차 없음"
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={fieldId('note')}>메모</Label>
        <Textarea
          id={fieldId('note')}
          value={note}
          maxLength={1000}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>{item ? '저장' : '일정 추가'}</SubmitButton>
      </div>
    </form>
  )
}
