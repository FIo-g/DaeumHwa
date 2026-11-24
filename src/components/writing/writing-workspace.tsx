'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CompleteConfirmDialog } from '@/components/chapters/complete-confirm-dialog'
import { MenuIcon, usePrefersReducedMotion } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { ChapterStatus } from '@/db/types'
import { lengthShortfall, shortfallMessage } from '@/lib/chapter-length'
import { startAutoCheck } from '@/lib/client/auto-check'
import { isSampleChapter } from '@/lib/client/sample-session'
import { type AutosaveInput, type AutosaveResult, useAutosave } from '@/lib/client/use-autosave'
import { runAction } from '@/lib/client/run-action'
import { countChars } from '@/lib/korean/chars'
import type { ActionResult } from '@/lib/result'
import { restoreChapterAction, setChapterStatusAction } from '@/server/actions/chapters'
import { saveChapterAction, saveResumePointAction } from '@/server/actions/manuscript'
import { ConflictDialog } from './conflict-dialog'
import { EditorToolbar } from './editor-toolbar'
import { ManuscriptEditor } from './manuscript-editor'
import { RecoveryDialog } from './recovery-dialog'
import { replaceQuoteText, replaceRangeText } from './text-ops'
import { WritingSidePanel } from './side-panel'
import type {
  CheckState,
  Highlight,
  ProofRevision,
  SelectionRange,
  WorkspaceApi,
  WritingData,
} from './types'

export type ServerCopy = { title: string; body: string; version: number; updatedAt: string }

/** Loads the latest saved copy of a chapter. Passed in from the page so this file stays free of route code. */
export type LoadServerCopy = (input: { chapterId: string }) => Promise<ActionResult<ServerCopy>>

type WritingWorkspaceProps = {
  data: WritingData
  loadServerCopy: LoadServerCopy
  /** Signed-in user, so device drafts are kept per user. Without it no draft is kept on this device. */
  userId?: string
  autoCheck?: boolean
}

const ignore = () => {}

/**
 * The writing screen: toolbar, manuscript editor and the side panel. Owns the autosave loop and
 * exposes the WorkspaceApi that side panels use to read and change the text.
 */
export function WritingWorkspace({
  data,
  loadServerCopy,
  userId,
  autoCheck,
}: WritingWorkspaceProps) {
  const router = useRouter()
  const { chapter, role, workId } = data
  const canEdit = (role === 'owner' || role === 'editor') && !chapter.archivedAt
  const canManage = role === 'owner' || role === 'editor'
  const wide = useWideLayout()
  const reduced = usePrefersReducedMotion()
  const [check, setCheck] = useState<CheckState>({
    checking: false,
    resultKey: 0,
    issueCount: data.issues.length,
  })
  const [cardLink, setCardLink] = useState<string | null>(null)
  const [editorHover, setEditorHover] = useState<string | null>(null)
  const [editorFocus, setEditorFocus] = useState<string | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [requestedId, setRequestedId] = useState<string | null>(null)
  const [revision, setRevision] = useState<ProofRevision | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const revisionAfterClose = useRef<ProofRevision | null>(null)
  const jumpAfterClose = useRef<{ start: number; end: number; id: string } | null>(null)
  const clearRequest = useCallback(() => setRequestedId(null), [])
  const linkedId = editorHover ?? cardLink ?? editorFocus

  // The version the server reported on the last conflict, read by the overwrite action.
  const conflictVersion = useRef<number | null>(null)
  const save = useCallback(
    async (input: AutosaveInput): Promise<AutosaveResult> => {
      const result = await saveChapterAction({ chapterId: chapter.id, ...input })
      if (!result.ok && result.error.code === 'CONFLICT') {
        conflictVersion.current = readCurrentVersion(result.error.details)
      }
      return result
    },
    [chapter.id],
  )

  const autosave = useAutosave({
    chapterId: chapter.id,
    userId,
    initialTitle: chapter.title,
    initialBody: chapter.body,
    initialVersion: chapter.version,
    save,
  })
  const { title, body, status, setTitle, setBody, setComposing, saveNow, replaceAll } = autosave

  // Mirrors the body so API calls made from effects or panels read the latest text.
  const textRef = useRef(body)
  useEffect(() => {
    textRef.current = body
  }, [body])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  useEffect(() => {
    const el = textareaRef.current
    if (el && pendingCaret.current !== null) {
      const caret = pendingCaret.current
      pendingCaret.current = null
      el.setSelectionRange(caret, caret)
    }
  }, [body])

  const [sources, setSources] = useState<Record<string, Highlight[]>>({})
  const highlights = useMemo(() => Object.values(sources).flat(), [sources])

  useEffect(() => {
    if (!revision) return
    const frame = requestAnimationFrame(() => {
      const note = textareaRef.current?.parentElement?.querySelector('.b-writing-revision')
      const rect = note?.getBoundingClientRect()
      if (rect && (rect.top < 180 || rect.bottom > window.innerHeight - 96)) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - window.innerHeight / 2),
          behavior: 'instant',
        })
      }
    })
    const timer = window.setTimeout(() => setRevision(null), 1160)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [revision])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    let frame = 0
    function readPosition() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bounds = el?.getBoundingClientRect()
        const marks = el?.parentElement?.querySelectorAll<HTMLElement>(
          '[data-proof-id]:not([data-proof-id="revision"])',
        )
        if (!bounds || !marks?.length || bounds.bottom < 0 || bounds.top > window.innerHeight) {
          setReadingId(null)
          return
        }
        const visibleTop = Math.max(0, bounds.top)
        const viewportHeight = Math.min(bounds.bottom, window.innerHeight) - visibleTop
        const line = visibleTop + Math.min(200, viewportHeight * 0.4)
        let nearest: string | null = null
        let distance = Infinity
        for (const mark of marks) {
          for (const rect of mark.getClientRects()) {
            if (rect.bottom < visibleTop || rect.top > window.innerHeight) continue
            const gap = Math.abs(rect.top + rect.height / 2 - line)
            if (gap >= distance) continue
            nearest = mark.dataset.proofId ?? null
            distance = gap
          }
        }
        setReadingId(nearest)
      })
    }
    readPosition()
    window.addEventListener('scroll', readPosition, { passive: true })
    window.addEventListener('resize', readPosition)
    return () => {
      window.removeEventListener('scroll', readPosition)
      window.removeEventListener('resize', readPosition)
      cancelAnimationFrame(frame)
    }
  }, [highlights, body])

  // Resume point: where the author is, saved on open and when the editor loses focus.
  const path = `/works/${workId}/chapters/${chapter.id}`
  useEffect(() => {
    void saveResumePointAction({ workId, chapterId: chapter.id, path })
  }, [workId, chapter.id, path])

  const applyBody = useCallback(
    (next: string) => {
      textRef.current = next
      setBody(next)
    },
    [setBody],
  )

  const focusRange = useCallback(
    (start: number, end: number, id?: string) => {
      const el = textareaRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(start, end)
      const mark =
        id &&
        Array.from(el.parentElement?.querySelectorAll<HTMLElement>('[data-proof-id]') ?? []).find(
          (element) => element.dataset.proofId === id,
        )
      if (mark) {
        const first = mark.getClientRects()[0]
        if (first) {
          window.scrollTo({
            top: Math.max(0, window.scrollY + first.top - window.innerHeight / 3),
            behavior: reduced ? 'instant' : 'smooth',
          })
          return
        }
      }
      scrollToOffset(el, start, reduced)
    },
    [reduced],
  )

  const api = useMemo<WorkspaceApi>(
    () => ({
      getText: () => textRef.current,
      replaceRange(start, end, replacement) {
        applyBody(replaceRangeText(textRef.current, start, end, replacement))
        pendingCaret.current = start + replacement.length
      },
      replaceQuote(quote, replacement, hintStart) {
        const next = replaceQuoteText(textRef.current, quote, replacement, hintStart)
        if (next === null) return false
        applyBody(next)
        return true
      },
      appendText(text) {
        applyBody(textRef.current + text)
      },
      setHighlights(source, next) {
        setSources((prev) => ({ ...prev, [source]: next }))
      },
      focusRange,
      getSelection(): SelectionRange | null {
        const el = textareaRef.current
        if (!el || el.selectionStart === el.selectionEnd) return null
        return {
          start: el.selectionStart,
          end: el.selectionEnd,
          text: textRef.current.slice(el.selectionStart, el.selectionEnd),
        }
      },
      saveNow,
      refresh: () => router.refresh(),
    }),
    [applyBody, focusRange, saveNow, router],
  )

  function handleBodyChange(next: string) {
    textRef.current = next
    setBody(next)
  }

  function handleBlur() {
    void saveNow()
    const cursor = textareaRef.current?.selectionStart ?? null
    // Sends a cursor, so the server skips revalidation for this call (see saveResumePointAction).
    void saveResumePointAction({ workId, chapterId: chapter.id, cursor, path })
  }

  /** Saves the open edit first, so leaving the chapter never loses the last keystrokes. */
  async function navigate(href: string) {
    await saveNow()
    router.push(href)
  }

  /** Confirmation text while a draft under the target length waits for "완료하기". */
  const [completeMessage, setCompleteMessage] = useState<string | null>(null)

  async function applyStatus(next: ChapterStatus) {
    // Read before the action: the confirm dialog path still sees 'draft' here.
    const wasDraft = chapter.status === 'draft'
    // Both the directive inference and the auto check read the saved manuscript.
    if (next === 'done') await saveNow()
    const result = await runAction(setChapterStatusAction({ chapterId: chapter.id, status: next }))
    if (result) {
      if (next === 'done' && !data.trial) fireDirectiveInfer(workId, chapter.id)
      router.refresh()
      if (wasDraft && next === 'done' && !data.trial) {
        const started = startAutoCheck({
          workId,
          chapterId: chapter.id,
          position: chapter.position,
          onDone: () => router.refresh(),
          navigate: (href) => router.push(href),
        })
        if (started && wide === false) setPanelOverride(true)
      }
    }
  }

  async function changeStatus(next: ChapterStatus) {
    if (next === 'done' && chapter.status === 'draft') {
      const { withSpaces } = countChars(textRef.current)
      if (lengthShortfall(withSpaces, data.targetChars)) {
        setCompleteMessage(shortfallMessage(withSpaces, data.targetChars))
        return
      }
    }
    await applyStatus(next)
  }

  async function reopenChapter() {
    const result = await runAction(restoreChapterAction({ chapterId: chapter.id }), {
      success: '회차를 다시 열었어요.',
    })
    if (result) router.refresh()
  }

  const [conflictPending, setConflictPending] = useState(false)

  async function loadServer() {
    setConflictPending(true)
    const copy = await runAction(loadServerCopy({ chapterId: chapter.id }))
    setConflictPending(false)
    if (!copy) return
    textRef.current = copy.body
    replaceAll(copy.title, copy.body, copy.version)
    router.refresh()
  }

  async function overwriteWithMine() {
    const version = conflictVersion.current
    if (version === null) return
    setConflictPending(true)
    const nextTitle = title
    const nextBody = textRef.current
    // keepHistory: the server copy being replaced must keep its own history row, even when the
    // other device saved within the coalesce window.
    const result = await saveChapterAction({
      chapterId: chapter.id,
      title: nextTitle,
      body: nextBody,
      expectedVersion: version,
      keepHistory: true,
    })
    setConflictPending(false)
    if (!result.ok) {
      if (result.error.code === 'CONFLICT') {
        conflictVersion.current = readCurrentVersion(result.error.details)
      }
      toast.error(result.error.message)
      return
    }
    replaceAll(nextTitle, nextBody, result.data.version)
    router.refresh()
  }

  const sampleChapter = useIsSampleChapter(chapter.id)
  const [panelOverride, setPanelOverride] = useState<boolean | null>(null)
  const panelOpen = wide === false && (panelOverride ?? (autoCheck || sampleChapter))

  const panelProps = {
    data,
    api,
    text: body,
    position: chapter.position,
    autoCheck,
    findings: {
      linkedId,
      readingId,
      requestedId,
      onLink: setCardLink,
      onRequestHandled: clearRequest,
      onCheckState: setCheck,
      onRevision(next: ProofRevision) {
        if (reduced) return
        if (wide === false && panelOpen) {
          revisionAfterClose.current = next
          setPanelOverride(false)
        } else {
          setRevision(next)
        }
      },
      onJump(start: number, end: number, id: string) {
        if (wide === false) {
          jumpAfterClose.current = { start, end, id }
          setPanelOverride(false)
        } else {
          focusRange(start, end, id)
        }
      },
    },
  }

  function showIssue(id: string) {
    setRequestedId(id)
    if (wide === false) setPanelOverride(true)
  }

  const mobilePanel = wide ? null : (
    <Sheet
      open={panelOpen}
      onOpenChange={setPanelOverride}
      onOpenChangeComplete={(open) => {
        if (open) return
        if (revisionAfterClose.current) {
          setRevision(revisionAfterClose.current)
          revisionAfterClose.current = null
        }
        const jump = jumpAfterClose.current
        if (!jump) return
        jumpAfterClose.current = null
        focusRange(jump.start, jump.end, jump.id)
      }}
    >
      <div className="b-writing-mobile-dock b-paper flex items-center justify-between gap-2 px-3 py-2 lg:hidden">
        <span className="text-sm font-bold">
          {check.checking ? '점검 중…' : `열린 지적 ${check.issueCount}건`}
        </span>
        <SheetTrigger render={<Button variant="outline" size="sm" className="lg:hidden" />}>
          <MenuIcon open={panelOpen} />
          패널 열기
        </SheetTrigger>
      </div>
      {wide === false && (
        <Dialog.Portal keepMounted>
          <Dialog.Backdrop className="b-overlay-motion fixed inset-0 z-50 bg-ink/[52%]" />
          <Dialog.Popup
            data-slot="sheet-content"
            className="b-writing-sheet b-paper fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto"
            initialFocus={closeButton}
            finalFocus={() => !jumpAfterClose.current && !revisionAfterClose.current}
          >
            <SheetHeader className="flex-row items-center justify-between gap-2 bg-leaf">
              <SheetTitle>작업 패널</SheetTitle>
              <SheetClose
                ref={closeButton}
                aria-label="닫기"
                render={<Button variant="outline" size="icon-sm" />}
              >
                <MenuIcon open={panelOpen} />
              </SheetClose>
            </SheetHeader>
            <div className="px-3 pb-4">
              <WritingSidePanel {...panelProps} />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      )}
    </Sheet>
  )

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {chapter.archivedAt && (
        <div className="b-paper flex flex-wrap items-center justify-between gap-3 bg-apricot p-4 text-sm">
          <p>보관된 회차예요. 수정하기 전에 다시 열어 주세요.</p>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => void reopenChapter()}>
              회차 다시 열기
            </Button>
          )}
        </div>
      )}

      <EditorToolbar
        workId={workId}
        chapterId={chapter.id}
        chapters={data.chapters}
        status={status}
        canEdit={canEdit}
        chapterStatus={chapter.status}
        onSaveNow={() => void saveNow()}
        onStatusChange={(next) => void changeStatus(next)}
        onNavigate={(href) => void navigate(href)}
      />

      <div className="b-writing-stage flex min-w-0 items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ManuscriptEditor
            title={title}
            body={body}
            onTitleChange={setTitle}
            onBodyChange={handleBodyChange}
            onComposingChange={setComposing}
            onSelectionChange={ignore}
            onCursorChange={ignore}
            highlights={highlights}
            readOnly={!canEdit}
            targetChars={data.targetChars}
            textareaRef={textareaRef}
            onBlur={handleBlur}
            check={check}
            linkedId={linkedId}
            readingId={readingId}
            revision={reduced ? null : revision}
            onIssueHover={setEditorHover}
            onIssueFocus={setEditorFocus}
            onShowIssue={showIssue}
          />
          {mobilePanel}
        </div>
        {/* The column is reserved by CSS from the first paint, so the manuscript keeps its width
            when the panel mounts after hydration. */}
        <aside className="b-writing-aside sticky top-[calc(var(--b-nav)+1.5rem)] hidden max-h-[calc(100dvh-var(--b-nav)-3rem)] w-[320px] shrink-0 overflow-y-auto lg:block xl:w-[380px]">
          {wide && <WritingSidePanel {...panelProps} />}
        </aside>
      </div>

      {canEdit && (
        <RecoveryDialog
          open={autosave.recoverable !== null}
          savedAt={autosave.recoverable?.savedAt ?? null}
          stale={autosave.recoverableStale}
          onRecover={autosave.acceptRecovery}
          onDiscard={autosave.discardRecovery}
        />
      )}
      {canEdit && (
        <ConflictDialog
          open={status === 'conflict'}
          pending={conflictPending}
          onLoadServer={() => void loadServer()}
          onOverwrite={() => void overwriteWithMine()}
        />
      )}
      <CompleteConfirmDialog
        open={completeMessage !== null}
        message={completeMessage ?? ''}
        onConfirm={() => void applyStatus('done')}
        onOpenChange={(open) => {
          if (!open) setCompleteMessage(null)
        }}
      />
    </div>
  )
}

function subscribeNoop(): () => void {
  return () => {}
}

/** Reads the per-tab sample flag after hydration, so the server and client first render agree. */
function useIsSampleChapter(chapterId: string): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => isSampleChapter(chapterId),
    () => false,
  )
}

// Keep the panel mount in sync with Tailwind's lg breakpoint.
const WIDE_QUERY = '(min-width: 64rem)'

function wideQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(WIDE_QUERY)
}

function subscribeWide(onChange: () => void): () => void {
  const query = wideQuery()
  if (!query) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Null until the width is known: on the server and during hydration. */
function useWideLayout(): boolean | null {
  return useSyncExternalStore(
    subscribeWide,
    () => wideQuery()?.matches ?? false,
    () => null,
  )
}

function readCurrentVersion(details: unknown): number | null {
  if (typeof details !== 'object' || details === null || !('currentVersion' in details)) return null
  const value = details.currentVersion
  return typeof value === 'number' ? value : null
}

/** Fires the inferred-request inference after a chapter is done. Never waits and never shows errors. */
function fireDirectiveInfer(workId: string, chapterId: string) {
  void fetch(`/api/works/${workId}/directives/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterId }),
  }).catch(() => {})
}

/** Brings the offset into view. The textarea grows with its content, so the page is what scrolls. */
function scrollToOffset(el: HTMLTextAreaElement, offset: number, reduced: boolean) {
  const rect = el.getBoundingClientRect()
  const ratio = el.value.length > 0 ? offset / el.value.length : 0
  const target = window.scrollY + rect.top + rect.height * ratio - window.innerHeight / 3
  window.scrollTo({ top: Math.max(0, target), behavior: reduced ? 'instant' : 'smooth' })
}
