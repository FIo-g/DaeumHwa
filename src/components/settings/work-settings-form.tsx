'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useRef, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { updateWorkAction } from '@/server/actions/works'
import { SettingsSection } from './settings-section'

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
  const [showSavedMark, setShowSavedMark] = useState(false)
  const revision = useRef(0)

  function handleChange() {
    revision.current += 1
    setShowSavedMark(false)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const submittedRevision = revision.current
    setShowSavedMark(false)
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
        { success: '작품 설정을 저장했어요.' },
      )
      if (saved) {
        setShowSavedMark(revision.current === submittedRevision)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsSection
      title="작품 정보"
      lead={!canEdit && <p>소유자만 작품 정보를 바꿀 수 있어요.</p>}
    >
      <form onSubmit={onSubmit} onChange={handleChange} className="wg-settings-form">
        <div className="wg-settings-field">
          <Label htmlFor="work-title" className="wg-settings-write">
            제목
          </Label>
          <Input
            id="work-title"
            name="title"
            defaultValue={initial.title}
            required
            maxLength={100}
            disabled={!canEdit}
          />
        </div>
        <div className="wg-settings-field">
          <Label htmlFor="work-genre" className="wg-settings-write">
            장르
          </Label>
          <Input
            id="work-genre"
            name="genre"
            defaultValue={initial.genre}
            maxLength={50}
            disabled={!canEdit}
          />
        </div>
        <div className="wg-settings-field wg-settings-field-wide">
          <Label htmlFor="work-logline" className="wg-settings-write">
            한 줄 소개
          </Label>
          <Textarea
            id="work-logline"
            name="logline"
            defaultValue={initial.logline.replace(/[\r\n]/g, '')}
            maxLength={200}
            disabled={!canEdit}
            rows={1}
            className="wg-settings-logline min-h-11"
            onChange={(event) => {
              const field = event.currentTarget
              if (field.value.includes('\n')) field.value = field.value.replaceAll('\n', '')
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
          />
        </div>
        <div className="wg-settings-field wg-settings-field-wide">
          <Label htmlFor="work-synopsis" className="wg-settings-write">
            시놉시스
          </Label>
          <Textarea
            id="work-synopsis"
            name="synopsis"
            defaultValue={initial.synopsis}
            maxLength={2000}
            rows={6}
            disabled={!canEdit}
            className="min-h-28 font-heading"
          />
        </div>
        <div className="wg-settings-field">
          <Label htmlFor="work-absence" className="wg-settings-write">
            장기 미등장 경고 기준 (회차 수)
          </Label>
          <Input
            id="work-absence"
            name="absenceThreshold"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            defaultValue={initial.absenceThreshold}
            disabled={!canEdit}
            className="font-mono"
          />
        </div>
        <div className="wg-settings-field">
          <Label htmlFor="work-target-chars" className="wg-settings-write">
            목표 글자 수
          </Label>
          <Input
            id="work-target-chars"
            name="targetChars"
            type="number"
            inputMode="numeric"
            min={500}
            max={20000}
            defaultValue={initial.targetChars}
            disabled={!canEdit}
            className="font-mono"
          />
        </div>
        {canEdit && (
          <div className="wg-settings-save">
            <span className="wg-settings-save-cell" aria-hidden="true">
              {showSavedMark && (
                <svg viewBox="0 0 20 20" fill="none" focusable="false">
                  <path d="M4 10.5 8 14.5 16 5.5" pathLength="1" />
                </svg>
              )}
            </span>
            <SubmitButton pending={pending}>저장</SubmitButton>
          </div>
        )}
      </form>
    </SettingsSection>
  )
}
