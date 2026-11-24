'use client'

import { ArrowUpRightIcon, FileUpIcon } from 'lucide-react'
import { type DragEvent, useState } from 'react'
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
        setError('빈 원고예요. 다른 파일을 골라 주세요.')
        return
      }
      onParsed({ fileName: file.name, text: parsed.text })
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했어요. 다시 시도해 주세요.')
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
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return
        setDragging(false)
      }}
      data-dragging={dragging}
      onDrop={handleDrop}
      className={cn(
        'b-tools-file-drop grid gap-4 rounded-card border-2 border-dashed border-ink p-4 text-center sm:p-6',
        dragging && 'bg-leaf/45',
      )}
    >
      <FileUpIcon className="b-tools-file-icon mx-auto size-10" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="font-medium">원고 파일을 끌어다 놓거나 아래에서 골라 주세요.</p>
        <p className="text-sm text-muted-foreground">
          txt, md, docx 파일을 올릴 수 있어요. hwp 파일은 한글에서 docx나 txt로 저장해 주세요.
        </p>
      </div>
      <div className="b-tools-file-field mx-auto">
        <Label htmlFor="manuscript-file" className="b-tools-file-choice">
          원고 파일
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </Label>
        <input
          id="manuscript-file"
          className="sr-only"
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
          파일을 읽고 있어요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  )
}
