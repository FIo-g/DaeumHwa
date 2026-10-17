'use client'

import { type RefObject, useEffect, useLayoutEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { countChars } from '@/lib/korean/chars'
import { cn } from '@/lib/utils'
import { HighlightLayer, MANUSCRIPT_TEXT_CLASS } from './highlight-layer'
import type { Highlight, SelectionRange } from './types'

export type ManuscriptEditorProps = {
  title: string
  body: string
  onTitleChange(value: string): void
  onBodyChange(value: string): void
  onComposingChange(composing: boolean): void
  onSelectionChange(range: SelectionRange | null): void
  onCursorChange(position: number): void
  highlights: Highlight[]
  readOnly: boolean
  targetChars: number
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** Fired when the body textarea loses focus (the workspace saves and records the position). */
  onBlur?(): void
}

type Layer = { text: string; highlights: Highlight[] }

/**
 * The manuscript editor: a title field and a textarea that grows with its content. A highlight
 * layer sits behind the textarea. While an IME composition (Korean jamo assembly) is open, the
 * layer keeps its previous text and highlights, so nothing is recomputed under the author's
 * fingers. They catch up on compositionend.
 */
export function ManuscriptEditor({
  title,
  body,
  onTitleChange,
  onBodyChange,
  onComposingChange,
  onSelectionChange,
  onCursorChange,
  highlights,
  readOnly,
  targetChars,
  textareaRef,
  onBlur,
}: ManuscriptEditorProps) {
  const [composing, setComposing] = useState(false)
  const [layer, setLayer] = useState<Layer>({ text: body, highlights })

  // State derived from props, adjusted during render: the layer follows the body and the
  // highlights, except while an IME composition is open.
  if (!composing && (layer.text !== body || layer.highlights !== highlights)) {
    setLayer({ text: body, highlights })
  }

  // Grow the textarea to its content so the page scrolls instead of the field.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    fit(el)
  }, [body, textareaRef])

  useEffect(() => {
    const onResize = () => {
      const el = textareaRef.current
      if (el) fit(el)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [textareaRef])

  const counts = countChars(body)
  const percent = targetChars > 0 ? Math.round((counts.withSpaces / targetChars) * 100) : 0

  function reportSelection(el: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = el
    onCursorChange(selectionStart)
    onSelectionChange(
      selectionStart === selectionEnd
        ? null
        : {
            start: selectionStart,
            end: selectionEnd,
            text: value.slice(selectionStart, selectionEnd),
          },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <Input
        aria-label="회차 제목"
        value={title}
        readOnly={readOnly}
        onChange={(e) => onTitleChange(e.target.value)}
        onCompositionStart={() => onComposingChange(true)}
        onCompositionEnd={() => onComposingChange(false)}
        className="h-auto border-0 bg-transparent px-5 text-xl font-semibold shadow-none focus-visible:ring-0 md:text-xl"
      />
      <div className="relative rounded-xl border bg-background">
        <HighlightLayer text={layer.text} highlights={layer.highlights} />
        <textarea
          ref={textareaRef}
          aria-label="원고 본문"
          rows={12}
          value={body}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onBodyChange(e.target.value)}
          onCompositionStart={() => {
            setComposing(true)
            onComposingChange(true)
          }}
          onCompositionEnd={() => {
            setComposing(false)
            onComposingChange(false)
          }}
          onSelect={(e) => reportSelection(e.currentTarget)}
          onBlur={() => onBlur?.()}
          className={cn(
            MANUSCRIPT_TEXT_CLASS,
            'relative block resize-none overflow-hidden bg-transparent outline-none caret-foreground focus-visible:ring-0',
            readOnly && 'cursor-default',
          )}
        />
      </div>
      <p className="text-right text-xs text-muted-foreground">
        공백 포함 {counts.withSpaces}자 · 제외 {counts.withoutSpaces}자 · 목표 대비 {percent}%
      </p>
    </div>
  )
}

/** Sets the textarea height to its content height. Never touches the value. */
function fit(el: HTMLTextAreaElement) {
  const { scrollX, scrollY } = window
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
  // Collapsing to auto height shortens the document for one layout pass, and the browser clamps
  // the page scroll. Put it back so typing at the end of a long chapter does not jump to the top.
  // Only restore when it changed, so an in-flight smooth scroll is not cut short.
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
  }
}
