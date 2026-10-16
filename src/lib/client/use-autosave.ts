'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, getDraft, saveDraft, type LocalDraft } from '@/lib/client/local-store'
import type { ActionResult } from '@/lib/result'

export type AutosaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error'

export type AutosaveInput = { title: string; body: string; expectedVersion: number }
export type AutosaveResult = ActionResult<{ version: number; updatedAt: string }>

export interface UseAutosaveOptions {
  chapterId: string
  initialTitle: string
  initialBody: string
  initialVersion: number
  save: (input: AutosaveInput) => Promise<AutosaveResult>
  /** Idle time before the server save. */
  serverDelayMs?: number
  /** Idle time before the device draft is written. */
  localDelayMs?: number
}

export interface UseAutosaveResult {
  title: string
  body: string
  setTitle(title: string): void
  setBody(body: string): void
  status: AutosaveStatus
  version: number
  lastSavedAt: Date | null
  saveNow(): Promise<void>
  /** Replaces the editor content, e.g. after the author picks the server copy on conflict. */
  replaceAll(title: string, body: string, version: number): void
  recoverable: LocalDraft | null
  acceptRecovery(): void
  discardRecovery(): void
  /** Pauses server saves while an IME composition is open. */
  setComposing(composing: boolean): void
}

/**
 * Autosave for one chapter. Edits go to IndexedDB quickly and to the server after an idle pause.
 * Nothing is sent while an IME composition is open. A failed server save keeps the device draft.
 * Mount the hook with a `key` per chapter.
 */
export function useAutosave(options: UseAutosaveOptions): UseAutosaveResult {
  const {
    chapterId,
    initialTitle,
    initialBody,
    initialVersion,
    serverDelayMs = 3000,
    localDelayMs = 500,
  } = options

  const [title, setTitleState] = useState(initialTitle)
  const [body, setBodyState] = useState(initialBody)
  const [version, setVersionState] = useState(initialVersion)
  const [status, setStatus] = useState<AutosaveStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [recoverable, setRecoverable] = useState<LocalDraft | null>(null)

  const latest = useRef({ title: initialTitle, body: initialBody })
  const versionRef = useRef(initialVersion)
  const revisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const composingRef = useRef(false)
  const initialRef = useRef({ title: initialTitle, body: initialBody, version: initialVersion })
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const rerun = useRef(false)
  const saveRef = useRef(options.save)
  const chapterRef = useRef(chapterId)

  useEffect(() => {
    saveRef.current = options.save
    chapterRef.current = chapterId
  })

  const writeLocal = useCallback(() => {
    void saveDraft(chapterRef.current, {
      title: latest.current.title,
      body: latest.current.body,
      savedAt: Date.now(),
      baseVersion: versionRef.current,
    })
  }, [])

  const cancelLocal = useCallback(() => {
    if (localTimer.current) clearTimeout(localTimer.current)
    localTimer.current = null
  }, [])

  const cancelServer = useCallback(() => {
    if (serverTimer.current) clearTimeout(serverTimer.current)
    serverTimer.current = null
  }, [])

  /** Sends the current content once. Resolves to true when the server accepted it. */
  const saveOnce = useCallback(async (): Promise<boolean> => {
    const revision = revisionRef.current
    const snapshot = { title: latest.current.title, body: latest.current.body }
    setStatus('saving')
    try {
      const result = await saveRef.current({
        ...snapshot,
        expectedVersion: versionRef.current,
      })
      if (result.ok) {
        versionRef.current = result.data.version
        setVersionState(result.data.version)
        setLastSavedAt(new Date(result.data.updatedAt))
        if (revisionRef.current === revision) {
          dirtyRef.current = false
          cancelLocal()
          void clearDraft(chapterRef.current)
          setStatus('saved')
        } else {
          setStatus('dirty')
        }
        return true
      }
      setStatus(result.error.code === 'CONFLICT' ? 'conflict' : 'error')
    } catch {
      setStatus('offline')
    }
    writeLocal()
    return false
  }, [cancelLocal, writeLocal])

  /** One save at a time. Edits that arrive while a save runs trigger one more save after it. */
  const runServerSave = useCallback((): Promise<void> => {
    if (inflight.current) {
      rerun.current = true
      return inflight.current
    }
    const run = (async () => {
      do {
        rerun.current = false
        if (composingRef.current || !dirtyRef.current) break
        const saved = await saveOnce()
        if (!saved) break
      } while (rerun.current)
    })()
    inflight.current = run
    void run.finally(() => {
      if (inflight.current === run) inflight.current = null
    })
    return run
  }, [saveOnce])

  const scheduleServer = useCallback(() => {
    cancelServer()
    serverTimer.current = setTimeout(() => {
      serverTimer.current = null
      void runServerSave()
    }, serverDelayMs)
  }, [cancelServer, runServerSave, serverDelayMs])

  const scheduleLocal = useCallback(() => {
    cancelLocal()
    localTimer.current = setTimeout(() => {
      localTimer.current = null
      writeLocal()
    }, localDelayMs)
  }, [cancelLocal, writeLocal, localDelayMs])

  const applyEdit = useCallback(
    (nextTitle: string, nextBody: string) => {
      if (nextTitle === latest.current.title && nextBody === latest.current.body) return
      latest.current = { title: nextTitle, body: nextBody }
      setTitleState(nextTitle)
      setBodyState(nextBody)
      revisionRef.current += 1
      dirtyRef.current = true
      if (!inflight.current) setStatus('dirty')
      scheduleLocal()
      if (composingRef.current) cancelServer()
      else scheduleServer()
    },
    [cancelServer, scheduleLocal, scheduleServer],
  )

  const setTitle = useCallback((next: string) => applyEdit(next, latest.current.body), [applyEdit])
  const setBody = useCallback((next: string) => applyEdit(latest.current.title, next), [applyEdit])

  const setComposing = useCallback(
    (composing: boolean) => {
      composingRef.current = composing
      if (composing) {
        cancelServer()
      } else if (dirtyRef.current) {
        scheduleServer()
      }
    },
    [cancelServer, scheduleServer],
  )

  const saveNow = useCallback(async () => {
    cancelServer()
    await runServerSave()
  }, [cancelServer, runServerSave])

  const replaceAll = useCallback(
    (nextTitle: string, nextBody: string, nextVersion: number) => {
      cancelServer()
      cancelLocal()
      latest.current = { title: nextTitle, body: nextBody }
      versionRef.current = nextVersion
      revisionRef.current += 1
      dirtyRef.current = false
      setTitleState(nextTitle)
      setBodyState(nextBody)
      setVersionState(nextVersion)
      setRecoverable(null)
      setStatus('saved')
      void clearDraft(chapterRef.current)
    },
    [cancelLocal, cancelServer],
  )

  const acceptRecovery = useCallback(() => {
    if (!recoverable) return
    const draft = recoverable
    setRecoverable(null)
    applyEdit(draft.title, draft.body)
  }, [applyEdit, recoverable])

  const discardRecovery = useCallback(() => {
    setRecoverable(null)
    void clearDraft(chapterRef.current)
  }, [])

  // Offer a device draft only when it was written against this version or a newer one and differs.
  useEffect(() => {
    let cancelled = false
    void getDraft(chapterId).then((draft) => {
      if (cancelled || !draft) return
      const initial = initialRef.current
      const differs = draft.body !== initial.body || draft.title !== initial.title
      if (draft.baseVersion >= initial.version && differs) setRecoverable(draft)
    })
    return () => {
      cancelled = true
    }
  }, [chapterId])

  // Flush when the tab is hidden or the editor unmounts, so the device keeps the latest text.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        writeLocal()
        void runServerSave()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (serverTimer.current) clearTimeout(serverTimer.current)
      if (localTimer.current) clearTimeout(localTimer.current)
      localTimer.current = null
      if (dirtyRef.current) writeLocal()
    }
  }, [runServerSave, writeLocal])

  return {
    title,
    body,
    setTitle,
    setBody,
    status,
    version,
    lastSavedAt,
    saveNow,
    replaceAll,
    recoverable,
    acceptRecovery,
    discardRecovery,
    setComposing,
  }
}
