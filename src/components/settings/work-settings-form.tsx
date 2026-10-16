'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { updateWorkAction } from '@/server/actions/works'

export type WorkSettingsValues = {
  title: string
  genre: string
  logline: string
  synopsis: string
  absenceThreshold: number
  targetChars: number
}

type WorkSettingsFormProps = {
  workId: string
  /** Only the owner can change work information. Others see the values read-only. */
  canEdit: boolean
  initial: WorkSettingsValues
}

/** Work information and writing settings. Owner-editable; read-only for other members. */
export function WorkSettingsForm({ workId, canEdit, initial }: WorkSettingsFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      const saved = await runAction(
        updateWorkAction({
          workId,
          title: String(form.get('title') ?? ''),
          genre: String(form.get('genre') ?? ''),
          logline: String(form.get('logline') ?? ''),
          synopsis: String(form.get('synopsis') ?? ''),
          settings: {
            absenceThreshold: Number(form.get('absenceThreshold')),
            targetChars: Number(form.get('targetChars')),
          },
        }),
        { success: '작품 설정을 저장했습니다.' },
      )
      if (saved) router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {!canEdit && (
        <p className="text-sm text-muted-foreground">소유자만 작품 정보를 바꿀 수 있습니다.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-title">제목</Label>
        <Input
          id="work-title"
          name="title"
          defaultValue={initial.title}
          required
          maxLength={100}
          disabled={!canEdit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-genre">장르</Label>
        <Input
          id="work-genre"
          name="genre"
          defaultValue={initial.genre}
          maxLength={50}
          disabled={!canEdit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-logline">한 줄 소개</Label>
        <Input
          id="work-logline"
          name="logline"
          defaultValue={initial.logline}
          maxLength={200}
          disabled={!canEdit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-synopsis">시놉시스</Label>
        <Textarea
          id="work-synopsis"
          name="synopsis"
          defaultValue={initial.synopsis}
          maxLength={2000}
          rows={6}
          disabled={!canEdit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-absence">장기 미등장 경고 기준 (회차 수)</Label>
        <Input
          id="work-absence"
          name="absenceThreshold"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          defaultValue={initial.absenceThreshold}
          disabled={!canEdit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-target-chars">목표 글자 수</Label>
        <Input
          id="work-target-chars"
          name="targetChars"
          type="number"
          inputMode="numeric"
          min={500}
          max={20000}
          defaultValue={initial.targetChars}
          disabled={!canEdit}
        />
      </div>
      {canEdit && (
        <div>
          <SubmitButton pending={pending}>저장</SubmitButton>
        </div>
      )}
    </form>
  )
}
