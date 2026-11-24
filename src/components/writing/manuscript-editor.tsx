'use client'

import { type RefObject, useEffect, useLayoutEffect, useState } from 'react'
import { ReadingProgress, ScanLine, usePrefersReducedMotion } from '@/components/motion'
import { Input } from '@/components/ui/input'
import { countChars } from '@/lib/korean/chars'
import { cn } from '@/lib/utils'
import { HighlightLayer, isProofHighlight, MANUSCRIPT_TEXT_CLASS } from './highlight-layer'
import type { CheckState, Highlight, ProofRevision, SelectionRange } from './types'

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
  check?: CheckState
  linkedId?: string | null
  readingId?: string | null
  revision?: ProofRevision | null
  onIssueHover?(id: string | null): void
  onIssueFocus?(id: string | null): void
  onShowIssue?(id: string): void
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
  check,
  linkedId,
  readingId,
  revision,
  onIssueHover,
  onIssueFocus,
  onShowIssue,
}: ManuscriptEditorProps) {
  const reduced = usePrefersReducedMotion()
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

  const proof = layer.highlights.filter(isProofHighlight)
  const openProof = proof.filter(({ closing }) => !closing)
  const counts = countChars(body)
  const percent = targetChars > 0 ? Math.round((counts.withSpaces / targetChars) * 100) : 0

  function reportSelection(el: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = el
    onIssueFocus?.(
      proof.find(({ start, end }) => selectionStart >= start && selectionStart < end)?.id ?? null,
    )
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
    <article
      className="b-writing-paper b-paper mx-auto flex w-full max-w-[48rem] flex-col"
      aria-label="회차 원고"
    >
      <ReadingProgress className="b-writing-progress" />
      <header className="b-writing-paper-head flex flex-wrap items-center gap-2">
        <Input
          aria-label="회차 제목"
          value={title}
          readOnly={readOnly}
          onChange={(e) => onTitleChange(e.target.value)}
          onCompositionStart={() => onComposingChange(true)}
          onCompositionEnd={() => onComposingChange(false)}
          className="b-writing-title-input h-11 w-auto min-w-0 flex-1 basis-36 border-0 bg-transparent text-lg font-bold"
        />
        {onShowIssue && openProof.length > 0 && !check?.checking && (
          <div
            role="group"
            aria-label="원고의 지적 번호"
            className="flex flex-wrap items-center gap-1"
          >
            <span className="pr-1 text-xs font-bold">지적</span>
            {openProof.map(({ id, order }) => (
              <button
                key={id}
                type="button"
                className="b-writing-proof-jump b-number"
                aria-label={`지적 ${(order ?? 0) + 1}번 보기`}
                onClick={() => onShowIssue(id)}
                onFocus={() => onIssueFocus?.(id)}
                onBlur={() => onIssueFocus?.(null)}
                onMouseEnter={() => onIssueHover?.(id)}
                onMouseLeave={() => onIssueHover?.(null)}
              >
                {(order ?? 0) + 1}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="relative">
        <HighlightLayer
          text={layer.text}
          highlights={layer.highlights}
          resultKey={check?.resultKey}
          linkedId={linkedId}
          readingId={readingId}
          revision={composing ? null : revision}
        />
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
          onFocus={(event) => reportSelection(event.currentTarget)}
          onBlur={() => {
            onIssueFocus?.(null)
            onBlur?.()
          }}
          onPointerMove={(event) => {
            if (!onIssueHover || event.pointerType !== 'mouse') return
            const { clientX, clientY } = event
            const marks = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
              '[data-proof-id]:not([data-proof-id="revision"])',
            )
            const hit =
              marks &&
              Array.from(marks).find((mark) =>
                Array.from(mark.getClientRects()).some(
                  (rect) =>
                    clientX >= rect.left &&
                    clientX <= rect.right &&
                    clientY >= rect.top &&
                    clientY <= rect.bottom,
                ),
              )
            onIssueHover(hit?.dataset.proofId ?? null)
          }}
          onPointerLeave={() => onIssueHover?.(null)}
          className={cn(
            MANUSCRIPT_TEXT_CLASS,
            'relative block resize-none overflow-hidden bg-transparent outline-none caret-foreground focus-visible:ring-0',
            readOnly && 'cursor-default',
          )}
        />
        <div className="b-writing-scan-track" aria-hidden="true">
          <div className="b-writing-scan-window">
            <ScanLine active={Boolean(check?.checking && !reduced)} className="b-writing-scan" />
          </div>
        </div>
      </div>
      <p className="b-writing-character-count text-right text-xs text-muted-foreground">
        공백 포함 {counts.withSpaces}자 · 제외 {counts.withoutSpaces}자 · 목표 대비 {percent}%
      </p>
    </article>
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
