'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WorkSettings } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import { updateWorkAction } from '@/server/actions/works'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

type PublishSettingsProps = {
  workId: string
  /** Owners can change the settings. Everyone else sees them read-only. */
  canEdit: boolean
  settings: Required<WorkSettings>
}

/** Publish weekdays, chapters per publish day, and buffer target. Owner only. */
export function PublishSettings({ workId, canEdit, settings }: PublishSettingsProps) {
  const router = useRouter()
  const [days, setDays] = useState<string[]>(settings.publishDays.map(String))
  const [perDay, setPerDay] = useState(String(settings.chaptersPerPublishDay))
  const [buffer, setBuffer] = useState(String(settings.bufferTarget))
  const [pending, setPending] = useState(false)

  const dayText = settings.publishDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(', ')

  if (!canEdit) {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">연재 요일</dt>
          <dd>{dayText || '없음'}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">하루 회차 수</dt>
          <dd>{settings.chaptersPerPublishDay}화</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">비축 목표</dt>
          <dd>{settings.bufferTarget}화</dd>
        </div>
      </dl>
    )
  }

  const perDayNumber = Number(perDay)
  const bufferNumber = Number(buffer)
  const validDays = days.length > 0
  const validPerDay = Number.isInteger(perDayNumber) && perDayNumber >= 1 && perDayNumber <= 10
  const validBuffer = Number.isInteger(bufferNumber) && bufferNumber >= 0 && bufferNumber <= 100
  const canSave = validDays && validPerDay && validBuffer && !pending

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    setPending(true)
    try {
      const saved = await runAction(
        updateWorkAction({
          workId,
          settings: {
            publishDays: days.map(Number).sort((a, b) => a - b),
            chaptersPerPublishDay: perDayNumber,
            bufferTarget: bufferNumber,
          },
        }),
        { success: '연재 설정을 저장했습니다.' },
      )
      if (saved) router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label id="publish-days-label">연재 요일</Label>
        <ToggleGroup
          multiple
          value={days}
          onValueChange={setDays}
          aria-labelledby="publish-days-label"
          variant="outline"
          size="sm"
          className="flex-wrap"
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <ToggleGroupItem key={label} value={String(index)}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!validDays && <p className="text-xs text-destructive">연재 요일을 하나 이상 고르세요.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chapters-per-day">하루 회차 수</Label>
          <Input
            id="chapters-per-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className="max-w-32"
          />
          {!validPerDay && (
            <p className="text-xs text-destructive">1~10 사이의 숫자를 입력하세요.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buffer-target">비축 목표 (화)</Label>
          <Input
            id="buffer-target"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            className="max-w-32"
          />
          {!validBuffer && (
            <p className="text-xs text-destructive">0~100 사이의 숫자를 입력하세요.</p>
          )}
        </div>
      </div>
      <div>
        <SubmitButton pending={pending}>연재 설정 저장</SubmitButton>
      </div>
    </form>
  )
}
