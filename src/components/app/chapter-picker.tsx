'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChapterCaption } from './chapter-caption'

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
  popupClassName?: string
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
  popupClassName,
}: ChapterPickerProps) {
  const current = chapters.find((chapter) => chapter.id === value)
  return (
    <Select
      value={value ?? (allowNone ? NONE : null)}
      onValueChange={(next) => {
        if (next === null || next === NONE) onChange(null)
        else onChange(next)
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="wg-shell-picker w-40 max-w-full">
        <SelectValue>
          {value == null && allowNone ? (
            '없음'
          ) : current ? (
            <ChapterCaption {...current} />
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={popupClassName}>
        {allowNone && <SelectItem value={NONE}>없음</SelectItem>}
        {chapters.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <ChapterCaption {...c} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
