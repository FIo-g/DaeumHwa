'use client'

import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ProposalType } from '@/db/types'

// Editable text fields per proposal type. Paths point into the payload; a path with two parts
// reaches into `patch` for entry_update. List fields take comma-separated text.

type FieldSpec = {
  path: string[]
  label: string
  multiline?: boolean
  list?: boolean
}

const FIELDS: Record<ProposalType, FieldSpec[]> = {
  entry_create: [
    { path: ['name'], label: '이름' },
    { path: ['aliases'], label: '별칭 (쉼표로 구분)', list: true },
    { path: ['summary'], label: '요약', multiline: true },
  ],
  entry_update: [
    { path: ['patch', 'summary'], label: '요약', multiline: true },
    { path: ['patch', 'aliases'], label: '별칭 (쉼표로 구분)', list: true },
  ],
  fact_create: [
    { path: ['subjectName'], label: '대상' },
    { path: ['content'], label: '내용', multiline: true },
    { path: ['evidence'], label: '근거 문장', multiline: true },
  ],
  thread_create: [
    { path: ['title'], label: '제목' },
    { path: ['description'], label: '설명', multiline: true },
  ],
  thread_event: [{ path: ['note'], label: '메모', multiline: true }],
  relation_create: [
    { path: ['kind'], label: '관계 종류' },
    { path: ['description'], label: '설명', multiline: true },
  ],
  chapter_summary: [{ path: ['summary'], label: '요약', multiline: true }],
  style_card: [
    { path: ['name'], label: '이름' },
    { path: ['tone'], label: '말투와 분위기' },
    { path: ['rules'], label: '규칙', multiline: true },
    { path: ['examples'], label: '예시', multiline: true },
  ],
}

type Json = Record<string, unknown>

function getIn(obj: Json, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Json)[key]
  }
  return cur
}

/** Returns a copy of `obj` with `value` set at `path`. The input is not mutated. */
function setIn(obj: Json, path: string[], value: unknown): Json {
  const [head, ...rest] = path
  if (rest.length === 0) return { ...obj, [head]: value }
  const child = obj[head] && typeof obj[head] === 'object' ? (obj[head] as Json) : {}
  return { ...obj, [head]: setIn(child, rest, value) }
}

function displayText(value: unknown, list: boolean | undefined): string {
  if (list) return Array.isArray(value) ? value.filter((v) => typeof v === 'string').join(', ') : ''
  return typeof value === 'string' ? value : ''
}

function parseList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

type ProposalPayloadEditorProps = {
  type: ProposalType
  payload: unknown
  onChange: (payload: Record<string, unknown>) => void
}

/** Text inputs for the editable fields of one proposal type. Emits the whole edited payload. */
export function ProposalPayloadEditor({ type, payload, onChange }: ProposalPayloadEditorProps) {
  const baseId = useId()
  const current: Json = payload && typeof payload === 'object' ? (payload as Json) : {}
  return (
    <div className="grid gap-3">
      {FIELDS[type].map((field) => (
        <PayloadField
          key={field.path.join('.')}
          id={`${baseId}-${field.path.join('-')}`}
          field={field}
          payload={current}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function PayloadField({
  id,
  field,
  payload,
  onChange,
}: {
  id: string
  field: FieldSpec
  payload: Json
  onChange: (payload: Record<string, unknown>) => void
}) {
  // List fields keep their raw text while typing, so a trailing comma survives until the next value.
  const [text, setText] = useState(() => displayText(getIn(payload, field.path), field.list))

  function handleChange(raw: string) {
    setText(raw)
    const value = field.list ? parseList(raw) : raw
    onChange(setIn(payload, field.path, value))
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {field.multiline ? (
        <Textarea id={id} value={text} onChange={(e) => handleChange(e.target.value)} />
      ) : (
        <Input id={id} value={text} onChange={(e) => handleChange(e.target.value)} />
      )}
    </div>
  )
}
