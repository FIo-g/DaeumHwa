'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { ChapterStatus } from '@/db/types'
import { type AutosaveInput, type AutosaveResult, useAutosave } from '@/lib/client/use-autosave'
import { runAction } from '@/lib/client/run-action'
import type { ActionResult } from '@/lib/result'
import { restoreChapterAction, setChapterStatusAction } from '@/server/actions/chapters'
import { saveChapterAction, saveResumePointAction } from '@/server/actions/manuscript'
import { ConflictDialog } from './conflict-dialog'
import { EditorToolbar } from './editor-toolbar'
import { ManuscriptEditor } from './manuscript-editor'
import { RecoveryDialog } from './recovery-dialog'
import { replaceQuoteText, replaceRangeText } from './text-ops'
import { WritingSidePanel } from './side-panel'
import type { Highlight, SelectionRange, WorkspaceApi, WritingData } from './types'

export type ServerCopy = { title: string; body: string; version: number; updatedAt: string }

/** Loads the latest saved copy of a chapter. Passed in from the page so this file stays free of route code. */
export type LoadServerCopy = (input: { chapterId: string }) => Promise<ActionResult<ServerCopy>>

type WritingWorkspaceProps = {
  data: WritingData
  loadServerCopy: LoadServerCopy
}

const ignore = () => {}

/**
 * The writing screen: toolbar, manuscript editor and the side panel. Owns the autosave loop and
 * exposes the WorkspaceApi that side panels use to read and change the text.
 */
export function WritingWorkspace({ data, loadServerCopy }: WritingWorkspaceProps) {
  const router = useRouter()
  const { chapter, role, workId } = data
  const canEdit = (role === 'owner' || role === 'editor') && !chapter.archivedAt
  const canManage = role === 'owner' || role === 'editor'
  const wide = useWideLayout()

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
      focusRange(start, end) {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(start, end)
        scrollToOffset(el, start)
      },
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
    [applyBody, saveNow, router],
  )

  function handleBodyChange(next: string) {
    textRef.current = next
    setBody(next)
  }

  function handleBlur() {
    void saveNow()
    const cursor = textareaRef.current?.selectionStart ?? null
    void saveResumePointAction({ workId, chapterId: chapter.id, cursor, path })
  }

  /** Saves the open edit first, so leaving the chapter never loses the last keystrokes. */
  async function navigate(href: string) {
    await saveNow()
    router.push(href)
  }

  async function changeStatus(next: ChapterStatus) {
    const result = await runAction(setChapterStatusAction({ chapterId: chapter.id, status: next }))
    if (result) router.refresh()
  }

  async function reopenChapter() {
    const result = await runAction(restoreChapterAction({ chapterId: chapter.id }), {
      success: '회차를 다시 열었습니다.',
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
    const result = await saveChapterAction({
      chapterId: chapter.id,
      title: nextTitle,
      body: nextBody,
      expectedVersion: version,
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

  const panelProps = { data, api, text: body, position: chapter.position }

  const mobilePanel = wide ? null : (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>패널 열기</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>작업 패널</SheetTitle>
        </SheetHeader>
        <WritingSidePanel {...panelProps} />
      </SheetContent>
    </Sheet>
  )

  return (
    <div className="flex flex-col gap-4">
      {chapter.archivedAt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <p>보관된 회차입니다. 고치려면 다시 열어 주세요.</p>
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
        panelTrigger={mobilePanel}
      />

      <div className="flex items-start gap-8">
        <div className="min-w-0 flex-1">
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
          />
        </div>
        {wide && (
          <aside className="sticky top-6 max-h-[calc(100vh-3rem)] w-[340px] shrink-0 overflow-y-auto">
            <WritingSidePanel {...panelProps} />
          </aside>
        )}
      </div>

      {canEdit && (
        <RecoveryDialog
          open={autosave.recoverable !== null}
          savedAt={autosave.recoverable?.savedAt ?? null}
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
    </div>
  )
}

/** Wide screens show the panel beside the editor; narrower ones put it in a sheet. */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(min-width: 1024px)')
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return wide
}

function readCurrentVersion(details: unknown): number | null {
  if (typeof details !== 'object' || details === null || !('currentVersion' in details)) return null
  const value = details.currentVersion
  return typeof value === 'number' ? value : null
}

/** Brings the offset into view. The textarea grows with its content, so the page is what scrolls. */
function scrollToOffset(el: HTMLTextAreaElement, offset: number) {
  const rect = el.getBoundingClientRect()
  const ratio = el.value.length > 0 ? offset / el.value.length : 0
  const target = window.scrollY + rect.top + rect.height * ratio - window.innerHeight / 3
  window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}
