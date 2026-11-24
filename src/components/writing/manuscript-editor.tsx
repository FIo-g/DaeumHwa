'use client'

import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ReadingProgress, ScanLine, Sheet } from '@/components/motion'
import { Input } from '@/components/ui/input'
import { countChars } from '@/lib/korean/chars'
import { cn } from '@/lib/utils'
import { HighlightLayer, isProofHighlight, MANUSCRIPT_TEXT_CLASS } from './highlight-layer'
import type { CheckState, Highlight, ProofRevision, SelectionRange } from './types'

export type ManuscriptEditorProps = {
  page?: number
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

type Composition = { text: string; highlights: Highlight[]; start: number; end: number }

/** Keeps marks on the unchanged parts of the manuscript while the IME edits a selection. */
function compositionHighlights(composition: Composition, text: string) {
  const { text: original, highlights, start, end } = composition
  if (text === original) return highlights
  const delta = text.length - original.length
  if (
    start > end + delta ||
    !text.startsWith(original.slice(0, start)) ||
    !text.endsWith(original.slice(end))
  ) {
    return []
  }
  return highlights.flatMap((highlight) => {
    if (highlight.end <= start) return [highlight]
    if (highlight.start >= end) {
      return [{ ...highlight, start: highlight.start + delta, end: highlight.end + delta }]
    }
    return []
  })
}

export function ManuscriptEditor({
  page,
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
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [composition, setComposition] = useState<Composition | null>(null)
  const displayedHighlights = useMemo(
    () => (composition ? compositionHighlights(composition, body) : highlights),
    [body, composition, highlights],
  )
  useLayoutEffect(() => {
    const mirror = mirrorRef.current
    const textarea = textareaRef.current
    if (
      !mirror ||
      !textarea ||
      typeof ResizeObserver === 'undefined' ||
      globalThis.CSS?.supports('field-sizing', 'content')
    ) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? parseFloat(getComputedStyle(mirror).blockSize)
      textarea.style.blockSize = `${height}px`
    })
    observer.observe(mirror, { box: 'border-box' })
    return () => observer.disconnect()
  }, [textareaRef])

  const proof = displayedHighlights.filter(isProofHighlight)
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
    <Sheet
      as="article"
      page={page === undefined ? undefined : String(page).padStart(2, '0')}
      className="wg-writing-paper"
      aria-label="회차 원고"
    >
      <ReadingProgress className="wg-writing-progress" />
      <header className="wg-writing-paper-head">
        <Input
          aria-label="회차 제목"
          value={title}
          readOnly={readOnly}
          onChange={(e) => onTitleChange(e.target.value)}
          onCompositionStart={() => onComposingChange(true)}
          onCompositionEnd={() => onComposingChange(false)}
          className="wg-writing-title-input h-auto min-w-0 flex-1 basis-36 font-heading text-[length:clamp(1.3125rem,2vw,1.5rem)] leading-tight font-bold"
        />
        {onShowIssue && openProof.length > 0 && !check?.checking && (
          <div role="group" aria-label="원고의 지적 번호" className="wg-writing-proof-nav">
            <span className="text-sm">지적</span>
            {openProof.map(({ id, order }) => (
              <button
                key={id}
                type="button"
                className="wg-writing-proof-jump font-mono"
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
      <div className="wg-writing-surface">
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={cn(MANUSCRIPT_TEXT_CLASS, 'wg-writing-mirror')}
        >
          {body === '' || body.endsWith('\n') ? body + '\u200b' : body}
        </div>
        <HighlightLayer
          text={body}
          highlights={displayedHighlights}
          mirrorRef={mirrorRef}
          textareaRef={textareaRef}
          resultKey={check?.resultKey}
          linkedId={linkedId}
          readingId={readingId}
          revision={composition ? null : revision}
        />
        <textarea
          ref={textareaRef}
          aria-label="원고 본문"
          rows={1}
          wrap="soft"
          value={body}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onBodyChange(e.target.value)}
          onCompositionStart={({ currentTarget }) => {
            setComposition({
              text: currentTarget.value,
              highlights,
              start: currentTarget.selectionStart,
              end: currentTarget.selectionEnd,
            })
            onComposingChange(true)
          }}
          onCompositionEnd={() => {
            setComposition(null)
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
          className={cn(MANUSCRIPT_TEXT_CLASS, 'wg-writing-input', readOnly && 'cursor-default')}
        />
        <div className="wg-writing-scan-track" aria-hidden="true">
          <div className="wg-writing-scan-window">
            <ScanLine active={Boolean(check?.checking)} className="wg-writing-scan" />
          </div>
        </div>
      </div>
      <p className="wg-writing-character-count font-mono text-right text-xs text-muted-ink">
        공백 포함 {counts.withSpaces}자 · 제외 {counts.withoutSpaces}자 · 목표 대비 {percent}%
      </p>
    </Sheet>
  )
}
