'use client'

import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useState } from 'react'
import { SubmitButton } from '@/components/app/submit-button'
import { PopButton } from '@/components/motion'
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
import type { ContextTier, EntryKind } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import {
  CHARACTER_FIELD_LABELS,
  CONTEXT_TIER_LABEL,
  ENTRY_KIND_LABEL,
  PLACE_FIELD_LABELS,
} from '@/lib/labels'
import { createEntryAction, updateEntryAction } from '@/server/actions/wiki'
import { SelectField } from './select-field'

/** The editable parts of a wiki card, as the detail page passes them in. */
export type EditableEntry = {
  id: string
  kind: EntryKind
  name: string
  aliases: string[]
  summary: string
  body: string
  fields: Record<string, string>
  customFields: { key: string; value: string }[]
  contextTier?: ContextTier
}

type EntryFormDialogProps = {
  workId: string
  mode: 'create' | 'edit'
  /** Kinds the author can pick in this dialog. */
  kinds: EntryKind[]
  defaultKind: EntryKind
  entry?: EditableEntry | null
  triggerLabel: string
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost'
  triggerSize?: 'default' | 'sm'
}

const CONTEXT_TIER_OPTIONS: { value: ContextTier; label: string }[] = (
  ['always', 'mention', 'never'] as const
).map((value) => ({ value, label: CONTEXT_TIER_LABEL[value] }))

const FIELD_LABELS: Partial<Record<EntryKind, Record<string, string>>> = {
  character: CHARACTER_FIELD_LABELS,
  place: PLACE_FIELD_LABELS,
}

/** Opens a dialog that creates a wiki card (mode create) or edits one (mode edit). */
export function EntryFormDialog({
  workId,
  mode,
  kinds,
  defaultKind,
  entry,
  triggerLabel,
  triggerVariant = 'outline',
  triggerSize = 'default',
}: EntryFormDialogProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          mode === 'create' ? (
            <PopButton arrow={false} />
          ) : (
            <Button variant={triggerVariant} size={triggerSize} />
          )
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '카드 만들기' : '카드 수정'}</DialogTitle>
        </DialogHeader>
        <EntryFormFields
          workId={workId}
          mode={mode}
          kinds={kinds}
          defaultKind={defaultKind}
          entry={entry ?? null}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function EntryFormFields({
  workId,
  mode,
  kinds,
  defaultKind,
  entry,
  onDone,
}: {
  workId: string
  mode: 'create' | 'edit'
  kinds: EntryKind[]
  defaultKind: EntryKind
  entry: EditableEntry | null
  onDone: () => void
}) {
  const router = useRouter()
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? defaultKind)
  const [name, setName] = useState(entry?.name ?? '')
  const [aliases, setAliases] = useState((entry?.aliases ?? []).join(', '))
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [fields, setFields] = useState<Record<string, string>>(entry?.fields ?? {})
  const [customFields, setCustomFields] = useState(entry?.customFields ?? [])
  const [contextTier, setContextTier] = useState<ContextTier>(entry?.contextTier ?? 'mention')
  const [pending, setPending] = useState(false)

  const fieldLabels = FIELD_LABELS[kind] ?? {}

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedFields = { ...entry?.fields }
    for (const key of Object.keys(fieldLabels)) {
      const value = (fields[key] ?? '').trim()
      if (value === '') delete submittedFields[key]
      else submittedFields[key] = value
    }
    const input = {
      kind,
      name: name.trim(),
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== ''),
      summary: summary.trim(),
      body,
      fields: submittedFields,
      customFields: customFields
        .map((c) => ({ key: c.key.trim(), value: c.value.trim() }))
        .filter((c) => c.key !== ''),
      contextTier,
    }
    setPending(true)
    const saved =
      mode === 'create' || !entry
        ? await runAction(createEntryAction({ workId, ...input }), {
            success: '카드를 만들었어요.',
          })
        : await runAction(updateEntryAction({ entryId: entry.id, ...input }), {
            success: '카드를 저장했어요.',
          })
    setPending(false)
    if (saved) {
      onDone()
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="wg-wiki-form">
      {kinds.length > 1 && (
        <SelectField
          id="entry-kind"
          label="분류"
          value={kind}
          options={kinds.map((k) => ({ value: k, label: ENTRY_KIND_LABEL[k] }))}
          onChange={setKind}
        />
      )}
      <TextField id="entry-name" label="이름" value={name} onChange={setName} required />
      <TextField
        id="entry-aliases"
        label="별칭 (쉼표로 구분)"
        value={aliases}
        onChange={setAliases}
      />
      <TextField
        id="entry-summary"
        label="한 줄 요약"
        value={summary}
        onChange={setSummary}
        hint="짧게 쓸수록 AI가 같은 묘사를 덜 반복해요."
      />
      <SelectField
        id="entry-context-tier"
        label="AI 문맥"
        value={contextTier}
        options={CONTEXT_TIER_OPTIONS}
        onChange={setContextTier}
      />
      {Object.entries(fieldLabels).map(([key, label]) => (
        <TextField
          key={key}
          id={`entry-field-${key}`}
          label={label}
          value={fields[key] ?? ''}
          onChange={(value) => setFields((prev) => ({ ...prev, [key]: value }))}
        />
      ))}
      <div className="wg-wiki-custom-fields">
        <p className="text-sm font-medium">자유 필드</p>
        {customFields.map((row, index) => (
          <div key={index} className="wg-wiki-custom-row">
            <Input
              aria-label={`자유 필드 이름 ${index + 1}`}
              placeholder="항목 이름"
              value={row.key}
              onChange={(e) =>
                setCustomFields((prev) =>
                  prev.map((c, i) => (i === index ? { ...c, key: e.target.value } : c)),
                )
              }
            />
            <Input
              aria-label={`자유 필드 내용 ${index + 1}`}
              placeholder="내용"
              value={row.value}
              onChange={(e) =>
                setCustomFields((prev) =>
                  prev.map((c, i) => (i === index ? { ...c, value: e.target.value } : c)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`자유 필드 ${index + 1} 삭제`}
              onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2Icon strokeWidth={1.5} />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCustomFields((prev) => [...prev, { key: '', value: '' }])}
          >
            <PlusIcon strokeWidth={1.5} />
            항목 추가
          </Button>
        </div>
      </div>
      <div className="wg-wiki-form-row">
        <Label htmlFor="entry-body">설명</Label>
        <Textarea
          id="entry-body"
          className="b-manuscript"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
        />
      </div>
      <DialogFooter>
        <SubmitButton pending={pending}>저장</SubmitButton>
      </DialogFooter>
    </form>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  required,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
}): ReactNode {
  return (
    <div className="wg-wiki-form-row">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="wg-wiki-form-hint">
          {hint}
        </p>
      )}
    </div>
  )
}
