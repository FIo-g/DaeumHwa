'use client'

import { type DragEvent, useState } from 'react'
import { Sheet } from '@/components/motion'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getTextWorker } from '@/lib/client/worker-client'

const ACCEPT = '.txt,.md,.docx'

export type SelectedFile = { fileName: string; size: number }

type FileDropProps = {
  disabled?: boolean
  onSelect?: (file: SelectedFile) => void
  /** Called with the plain text of the file once the worker has decoded it. */
  onParsed: (file: { fileName: string; text: string }) => void
}

/** Step 1 of the import: pick or drop a TXT, MD or DOCX file and decode it in the worker. */
export function FileDrop({ disabled = false, onSelect, onParsed }: FileDropProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<SelectedFile | null>(null)

  async function readFile(file: File) {
    const selection = { fileName: file.name, size: file.size }
    setSelected(selection)
    onSelect?.(selection)
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
        if (!disabled && !busy) setDragging(true)
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
      className="wg-import-drop"
    >
      <Sheet as="div" label="20×10" ruled className="wg-import-drop-sheet">
        <p className="wg-import-write font-medium">
          원고 파일을 끌어다 놓거나 아래에서 골라 주세요.
        </p>
        <p className="wg-import-write text-sm text-muted-foreground">
          txt, md, docx 파일을 올릴 수 있어요. hwp 파일은 한글에서 docx나 txt로 저장해 주세요.
        </p>
        <div className="wg-import-file-field wg-import-write">
          <Label htmlFor="manuscript-file" className={buttonVariants()}>
            원고 파일
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
        {selected && <FileDetails file={selected} />}
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            파일을 읽고 있어요.
          </p>
        )}
        {error && (
          <p role="alert" className="wg-import-error text-sm">
            {error}
          </p>
        )}
      </Sheet>
    </div>
  )
}

export function FileDetails({ file }: { file: SelectedFile }) {
  return (
    <p className="wg-import-write flex flex-wrap items-baseline gap-x-3 font-mono text-sm">
      <span className="min-w-0 wrap-anywhere">{file.fileName}</span>
      <span className="text-muted-foreground">{file.size.toLocaleString('ko-KR')} B</span>
    </p>
  )
}
