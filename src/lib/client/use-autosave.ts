'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDraft,
  draftKey,
  getDraft,
  saveDraft,
  type LocalDraft,
} from '@/lib/client/local-store'
import type { ActionResult } from '@/lib/result'

export type AutosaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error'

export type AutosaveInput = {
  title: string
  body: string
  expectedVersion: number
  /** Set after a stale draft is recovered, so the server keeps the copy it replaces in history. */
  keepHistory?: boolean
}
export type AutosaveResult = ActionResult<{ version: number; updatedAt: string }>

export interface UseAutosaveOptions {
  chapterId: string
  /**
   * Signed-in user. Device drafts are stored per user. Without it no draft is kept on this device,
   * so one person's unsaved text is never offered to another.
   */
  userId?: string
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
  /** True when the recoverable draft was written against an older server version than the one shown. */
  recoverableStale: boolean
  acceptRecovery(): void
  discardRecovery(): void
  /** Pauses server saves while an IME composition is open. */
  setComposing(composing: boolean): void
}

type Flusher = () => Promise<boolean>
const flushers = new Set<Flusher>()

/**
 * Saves every mounted editor now. Resolves to true when none of them still has unsaved edits.
 * Call it before signing out, so the last keystrokes reach the server first.
 */
export async function flushPendingSaves(): Promise<boolean> {
  const results = await Promise.all(Array.from(flushers, (flush) => flush()))
  return results.every(Boolean)
}

/**
 * Autosave for one chapter. Edits go to IndexedDB quickly and to the server after an idle pause.
 * Nothing is sent while an IME composition is open. A failed server save keeps the device draft.
 * Mount the hook with a `key` per chapter.
 */
export function useAutosave(options: UseAutosaveOptions): UseAutosaveResult {
  const {
    chapterId,
    userId,
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
  const [recoverableStale, setRecoverableStale] = useState(false)

  const latest = useRef({ title: initialTitle, body: initialBody })
  const versionRef = useRef(initialVersion)
  const revisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const composingRef = useRef(false)
  const keepHistoryNextRef = useRef(false)
  const initialRef = useRef({ title: initialTitle, body: initialBody, version: initialVersion })
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const rerun = useRef(false)
  const saveRef = useRef(options.save)
  // Null when no user is known: then no device draft is read or written.
  const draftKeyRef = useRef<string | null>(null)

  useEffect(() => {
    saveRef.current = options.save
    draftKeyRef.current = userId ? draftKey(userId, chapterId) : null
  })

  const writeLocal = useCallback(() => {
    const key = draftKeyRef.current
    if (!key) return
    void saveDraft(key, {
      title: latest.current.title,
      body: latest.current.body,
      savedAt: Date.now(),
      baseVersion: versionRef.current,
    })
  }, [])

  const dropLocal = useCallback(() => {
    const key = draftKeyRef.current
    if (key) void clearDraft(key)
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
        ...(keepHistoryNextRef.current ? { keepHistory: true } : {}),
      })
      if (result.ok) {
        keepHistoryNextRef.current = false
        versionRef.current = result.data.version
        setVersionState(result.data.version)
        setLastSavedAt(new Date(result.data.updatedAt))
        if (revisionRef.current === revision) {
          dirtyRef.current = false
          cancelLocal()
          dropLocal()
          setStatus('saved')
        } else {
          // Edits arrived during the round-trip. Keep them on this device against the version
          // the server now has, so they are not offered as stale later.
          writeLocal()
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
  }, [cancelLocal, dropLocal, writeLocal])

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

  // Lets the sign-out flow save this editor before it clears the device drafts.
  useEffect(() => {
    const flush: Flusher = async () => {
      await saveNow()
      return !dirtyRef.current
    }
    flushers.add(flush)
    return () => {
      flushers.delete(flush)
    }
  }, [saveNow])

  const replaceAll = useCallback(
    (nextTitle: string, nextBody: string, nextVersion: number) => {
      cancelServer()
      cancelLocal()
      latest.current = { title: nextTitle, body: nextBody }
      versionRef.current = nextVersion
      revisionRef.current += 1
      dirtyRef.current = false
      keepHistoryNextRef.current = false
      setTitleState(nextTitle)
      setBodyState(nextBody)
      setVersionState(nextVersion)
      setRecoverable(null)
      setRecoverableStale(false)
      setStatus('saved')
      dropLocal()
    },
    [cancelLocal, cancelServer, dropLocal],
  )

  const acceptRecovery = useCallback(() => {
    if (!recoverable) return
    const draft = recoverable
    // A stale draft replaces a newer server copy, so that copy must stay in the version history.
    keepHistoryNextRef.current = recoverableStale
    setRecoverable(null)
    setRecoverableStale(false)
    applyEdit(draft.title, draft.body)
  }, [applyEdit, recoverable, recoverableStale])

  const discardRecovery = useCallback(() => {
    setRecoverable(null)
    setRecoverableStale(false)
    dropLocal()
  }, [dropLocal])

  // Offer a device draft whenever its text differs from the server copy. A draft written against
  // an older version is flagged as stale. A draft with the same text has nothing to recover.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const key = draftKey(userId, chapterId)
    void getDraft(key).then((draft) => {
      if (cancelled || !draft) return
      const initial = initialRef.current
      const differs = draft.body !== initial.body || draft.title !== initial.title
      if (!differs) {
        void clearDraft(key)
        return
      }
      setRecoverableStale(draft.baseVersion < initial.version)
      setRecoverable(draft)
    })
    return () => {
      cancelled = true
    }
  }, [chapterId, userId])

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
    recoverableStale,
    acceptRecovery,
    discardRecovery,
    setComposing,
  }
}
