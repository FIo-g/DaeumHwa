'use client'

import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { postAction } from '@/lib/client/post-json'
import type { ChapterCheckResult } from '@/server/chapter-check'

export type AutoCheckInput = {
  workId: string
  chapterId: string
  /** Chapter number shown in the toasts. */
  position: number
  /** Runs after a finished check, e.g. router.refresh. Not called on failure or cancel. */
  onDone?: () => void
  /** Opens a path for the toast's approvals button, e.g. router.push. */
  navigate?: (href: string) => void
}

type AutoCheckRun = {
  controller: AbortController
  startedAt: number
}

type AutoCheckState = {
  running: boolean
  elapsedSec: number
}

const IDLE: AutoCheckState = { running: false, elapsedSec: 0 }

// Module state, not component state: a check keeps running when the author leaves the screen.
const runs = new Map<string, AutoCheckRun>()
const listeners = new Set<() => void>()
const states = new Map<string, AutoCheckState>()
let timer: ReturnType<typeof setInterval> | null = null

function notify(): void {
  for (const listener of listeners) listener()
}

function stateFor(chapterId: string): AutoCheckState {
  return states.get(chapterId) ?? IDLE
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function stopTimer(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
}

function startTimer(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    if (runs.size === 0) {
      stopTimer()
      return
    }
    const now = Date.now()
    for (const [chapterId, run] of runs) {
      states.set(chapterId, {
        running: true,
        elapsedSec: Math.floor((now - run.startedAt) / 1000),
      })
    }
    notify()
  }, 1000)
}

/** Starts the check after a chapter was marked done, unless one already runs for that chapter. Returns whether it started. */
export function startAutoCheck(input: AutoCheckInput): boolean {
  const { workId, chapterId, position, onDone, navigate } = input
  if (runs.has(chapterId)) return false

  const run: AutoCheckRun = { controller: new AbortController(), startedAt: Date.now() }
  runs.set(chapterId, run)
  states.set(chapterId, { running: true, elapsedSec: 0 })
  notify()
  startTimer()

  toast(`${position}화를 완료로 바꿨습니다. 회차 점검을 시작합니다.`)

  void postAction<ChapterCheckResult>(
    `/api/works/${workId}/chapters/${chapterId}/check`,
    {},
    { signal: run.controller.signal },
  ).then((result) => {
    if (runs.get(chapterId) === run) {
      runs.delete(chapterId)
      states.delete(chapterId)
      if (runs.size === 0) stopTimer()
      notify()
    }

    if (result.ok) {
      const { issues, proposals } = result.data
      toast.success(`${position}화 점검을 마쳤습니다.`, {
        description: `지적 ${issues.length}건, 승인 대기 후보 ${proposals.length}건`,
        duration: 10_000,
        ...(proposals.length > 0
          ? {
              action: {
                label: '승인 대기 보기',
                onClick: () => navigate?.(`/works/${workId}/approvals`),
              },
            }
          : {}),
      })
      onDone?.()
    } else if (result.error.code !== 'CANCELLED') {
      toast.error(`${position}화 자동 점검을 하지 못했습니다.`, {
        description: result.error.message,
      })
    }
  })

  return true
}

/** Aborts the chapter's running auto check and shows `취소했습니다.`; no-op when none runs. */
export function cancelAutoCheck(chapterId: string): void {
  const run = runs.get(chapterId)
  if (!run) return

  runs.delete(chapterId)
  states.delete(chapterId)
  if (runs.size === 0) stopTimer()
  notify()
  run.controller.abort()
  toast('취소했습니다.')
}

/** Running state for one chapter. elapsedSec counts whole seconds since the start, updated every second. */
export function useAutoCheck(chapterId: string): AutoCheckState {
  return useSyncExternalStore(
    subscribe,
    () => stateFor(chapterId),
    () => IDLE,
  )
}

/** Tests only: aborts every run and clears the state without toasts. */
export function resetAutoChecksForTests(): void {
  for (const run of runs.values()) run.controller.abort()
  runs.clear()
  states.clear()
  stopTimer()
  notify()
}
