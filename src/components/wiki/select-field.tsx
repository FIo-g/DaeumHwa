'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SelectFieldProps<T extends string> = {
  id: string
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/** Labelled single-choice select for a fixed list of string values. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const labels = new Map<string, string>(options.map((o) => [o.value, o.label]))
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next: string | null) => {
          if (next) onChange(next as T)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(selected: string | null) => labels.get(selected ?? '') ?? ''}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
