'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { chapterLabel } from '@/lib/labels'

type ChapterPickerProps = {
  chapters: { id: string; position: number; title: string }[]
  value: string | null
  onChange: (id: string | null) => void
  /** Adds a "없음" item that maps to null. */
  allowNone?: boolean
  placeholder?: string
  /** Forwarded to the trigger so the picker has a DOM id (for <label htmlFor>). */
  id?: string
  /** Accessible name for the trigger when no visible label is associated with it. */
  ariaLabel?: string
}

const NONE = '__none__'

/** Select for choosing one chapter, labelled like "3화 재회". */
export function ChapterPicker({
  chapters,
  value,
  onChange,
  allowNone = false,
  placeholder = '회차 선택',
  id,
  ariaLabel,
}: ChapterPickerProps) {
  const labels = new Map(chapters.map((c) => [c.id, chapterLabel(c.position, c.title)]))
  return (
    <Select
      value={value ?? (allowNone ? NONE : null)}
      onValueChange={(next) => {
        if (next === null || next === NONE) onChange(null)
        else onChange(next)
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="min-w-40">
        <SelectValue>
          {(selected: string | null) => {
            if (selected === NONE) return '없음'
            if (selected === null) return placeholder
            return labels.get(selected) ?? placeholder
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>없음</SelectItem>}
        {chapters.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {chapterLabel(c.position, c.title)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
