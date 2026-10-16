'use client'

import { type DragEvent, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTextWorker } from '@/lib/client/worker-client'
import { cn } from '@/lib/utils'

const ACCEPT = '.txt,.md,.docx'

type FileDropProps = {
  disabled?: boolean
  /** Called with the plain text of the file once the worker has decoded it. */
  onParsed: (file: { fileName: string; text: string }) => void
}

/** Step 1 of the import: pick or drop a TXT, MD or DOCX file and decode it in the worker. */
export function FileDrop({ disabled = false, onParsed }: FileDropProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function readFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const parsed = await getTextWorker().parseFile(file.name, bytes)
      if (parsed.text.trim().length === 0) {
        setError('원고 내용이 비어 있습니다. 다른 파일을 골라 주세요.')
        return
      }
      onParsed({ fileName: file.name, text: parsed.text })
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (disabled || busy) return
    const file = event.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'grid gap-4 rounded-xl border border-dashed p-6 text-center transition-colors',
        dragging && 'border-primary bg-muted/50',
      )}
    >
      <div className="grid gap-1">
        <p className="font-medium">원고 파일을 끌어다 놓거나 아래에서 고르세요</p>
        <p className="text-sm text-muted-foreground">
          TXT, MD, DOCX 파일을 올릴 수 있습니다. HWP는 한글에서 DOCX나 TXT로 저장한 뒤 올려 주세요.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-xs gap-1.5 text-left">
        <Label htmlFor="manuscript-file">원고 파일</Label>
        <Input
          id="manuscript-file"
          type="file"
          accept={ACCEPT}
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void readFile(file)
          }}
        />
      </div>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          파일을 읽는 중입니다.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
