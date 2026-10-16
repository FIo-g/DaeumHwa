'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useId, useState } from 'react'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { SubmitButton } from '@/components/app/submit-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { IMPORTANCE, type Importance } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { ENTRY_KIND_LABEL, IMPORTANCE_LABEL } from '@/lib/labels'
import { createThreadAction, updateThreadAction } from '@/server/actions/threads'
import type { ChapterOption, EntryOption, ThreadItem } from './thread-types'

type ThreadFormProps = {
  workId: string
  chapters: ChapterOption[]
  entries: EntryOption[]
  /** When given, the form edits the details of this thread. Status moves go through events. */
  thread?: ThreadItem
  onDone: () => void
  onCancel?: () => void
}

type NewStatus = 'planned' | 'planted'

const STATUS_OPTIONS: { value: NewStatus; label: string }[] = [
  { value: 'planned', label: '계획됨' },
  { value: 'planted', label: '심음' },
]

/** Empty input means no target chapter. Anything else must be a whole number. */
function parseTarget(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}

/** Creates a thread (계획됨 or 심음) or edits the details of an existing one. */
export function ThreadForm({
  workId,
  chapters,
  entries,
  thread,
  onDone,
  onCancel,
}: ThreadFormProps) {
  const router = useRouter()
  const ids = useId()
  const editing = thread !== undefined

  const [title, setTitle] = useState(thread?.title ?? '')
  const [description, setDescription] = useState(thread?.description ?? '')
  const [status, setStatus] = useState<NewStatus>('planned')
  const [plantedChapterId, setPlantedChapterId] = useState<string | null>(null)
  const [target, setTarget] = useState(
    thread?.targetChapterPosition ? String(thread.targetChapterPosition) : '',
  )
  const [importance, setImportance] = useState<Importance>(thread?.importance ?? 'medium')
  const [relatedIds, setRelatedIds] = useState<string[]>(
    thread?.relatedEntries.map((e) => e.id) ?? [],
  )
  const [pending, setPending] = useState(false)

  function toggleRelated(id: string, checked: boolean) {
    setRelatedIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      const targetChapterPosition = parseTarget(target)
      const saved = thread
        ? await runAction(
            updateThreadAction({
              threadId: thread.id,
              title,
              description,
              targetChapterPosition,
              importance,
              relatedEntryIds: relatedIds,
            }),
            { success: '떡밥을 고쳤습니다.' },
          )
        : await runAction(
            createThreadAction({
              workId,
              title,
              description,
              status,
              plantedChapterId: status === 'planted' ? plantedChapterId : null,
              targetChapterPosition,
              importance,
              relatedEntryIds: relatedIds,
            }),
            { success: '떡밥을 만들었습니다.' },
          )
      if (saved) {
        router.refresh()
        onDone()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-title`}>제목</Label>
        <Input
          id={`${ids}-title`}
          value={title}
          maxLength={100}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-description`}>설명</Label>
        <Textarea
          id={`${ids}-description`}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {editing ? (
        <p className="text-sm text-muted-foreground">
          상태와 심은 회차는 아래 기록 추가에서 바꿉니다.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-status`}>상태</Label>
            <Select
              value={status}
              onValueChange={(next) => {
                if (next === 'planned' || next === 'planted') setStatus(next)
              }}
            >
              <SelectTrigger id={`${ids}-status`} className="w-full">
                <SelectValue>
                  {(selected: string | null) =>
                    STATUS_OPTIONS.find((o) => o.value === selected)?.label ?? ''
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === 'planted' && (
            <div role="group" aria-labelledby={`${ids}-planted`} className="flex flex-col gap-1.5">
              <Label id={`${ids}-planted`}>심은 회차</Label>
              <ChapterPicker
                chapters={chapters}
                value={plantedChapterId}
                onChange={setPlantedChapterId}
                placeholder="심은 회차 선택"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-target`}>회수 목표 회차</Label>
          <Input
            id={`${ids}-target`}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-importance`}>중요도</Label>
          <Select
            value={importance}
            onValueChange={(next) => {
              if (next) setImportance(next as Importance)
            }}
          >
            <SelectTrigger id={`${ids}-importance`} className="w-full">
              <SelectValue>
                {(selected: string | null) =>
                  selected ? IMPORTANCE_LABEL[selected as Importance] : ''
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {IMPORTANCE.map((value) => (
                <SelectItem key={value} value={value}>
                  {IMPORTANCE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm leading-none font-medium">관련 카드</legend>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">연결할 카드가 없습니다.</p>
        ) : (
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {entries.map((entry) => {
              const checkboxId = `${ids}-entry-${entry.id}`
              return (
                <div key={entry.id} className="flex items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={relatedIds.includes(entry.id)}
                    onCheckedChange={(checked) => toggleRelated(entry.id, checked)}
                  />
                  <Label htmlFor={checkboxId} className="font-normal">
                    {entry.name}
                    <span className="text-muted-foreground">({ENTRY_KIND_LABEL[entry.kind]})</span>
                  </Label>
                </div>
              )
            })}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{editing ? '저장' : '떡밥 만들기'}</SubmitButton>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        )}
      </div>
    </form>
  )
}
