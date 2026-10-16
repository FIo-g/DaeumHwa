'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
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
import { createScheduleItemAction } from '@/server/actions/schedule'

type ScheduleItemFormProps = {
  workId: string
  /** Default start date (today in Seoul). */
  today: string
  chapters: { id: string; position: number; title: string }[]
}

/** Adds a schedule item: deadline, publish, hiatus, or other event. Editor only. */
export function ScheduleItemForm({ workId, today, chapters }: ScheduleItemFormProps) {
  const router = useRouter()
  const [kind, setKind] = useState<ScheduleKind>('deadline')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      const created = await runAction(
        createScheduleItemAction({
          workId,
          kind,
          title,
          date,
          endDate: kind === 'hiatus' && endDate ? endDate : null,
          chapterId,
          note,
        }),
        { success: '일정을 추가했습니다.' },
      )
      if (created) {
        setTitle('')
        setEndDate('')
        setChapterId(null)
        setNote('')
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-kind">종류</Label>
        <Select
          value={kind}
          onValueChange={(next) => {
            if (next) setKind(next as ScheduleKind)
          }}
        >
          <SelectTrigger id="schedule-kind" className="w-full">
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
        <Label htmlFor="schedule-title">제목</Label>
        <Input
          id="schedule-title"
          value={title}
          maxLength={100}
          placeholder={SCHEDULE_KIND_LABEL[kind]}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-date">{kind === 'hiatus' ? '시작일' : '날짜'}</Label>
        <Input
          id="schedule-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {kind === 'hiatus' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-end-date">끝나는 날</Label>
          <Input
            id="schedule-end-date"
            type="date"
            value={endDate}
            min={date}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-chapter">회차</Label>
        <ChapterPicker
          chapters={chapters}
          value={chapterId}
          onChange={setChapterId}
          allowNone
          placeholder="회차 없음"
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="schedule-note">메모</Label>
        <Textarea
          id="schedule-note"
          value={note}
          maxLength={1000}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>일정 추가</SubmitButton>
      </div>
    </form>
  )
}
