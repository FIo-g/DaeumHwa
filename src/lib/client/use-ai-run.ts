'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const CANCELLED_MESSAGE = '취소했습니다.'

/**
 * Tracks one AI call from a panel: whether it runs, how many seconds it has taken, and a cancel
 * that aborts the signal given to `run`. `run` resolves null when cancelled, even if the
 * wrapped call never settles. Unmounting aborts the call too, silently.
 */
export function useAiRun(): {
  running: boolean
  elapsedSec: number
  run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null>
  cancel(): void
} {
  const [running, setRunning] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  // Leaving the panel or page aborts a call still in flight. No toast: the author did not cancel.
  useEffect(
    () => () => {
      stopTimer()
      const controller = controllerRef.current
      controllerRef.current = null
      controller?.abort()
    },
    [stopTimer],
  )

  const run = useCallback(
    async <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
      const controller = new AbortController()
      controllerRef.current = controller
      stopTimer()
      setElapsedSec(0)
      timerRef.current = setInterval(() => setElapsedSec((sec) => sec + 1), 1000)
      setRunning(true)
      const cancelled = new Promise<null>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(null), { once: true })
      })
      try {
        return await Promise.race([fn(controller.signal), cancelled])
      } catch (error) {
        if (controller.signal.aborted) return null
        throw error
      } finally {
        // A cancel has already cleared the state; only the run that is still current does it.
        if (controllerRef.current === controller) {
          controllerRef.current = null
          stopTimer()
          setRunning(false)
        }
      }
    },
    [stopTimer],
  )

  const cancel = useCallback(() => {
    const controller = controllerRef.current
    if (!controller) return
    controllerRef.current = null
    controller.abort()
    stopTimer()
    setRunning(false)
    toast(CANCELLED_MESSAGE)
  }, [stopTimer])

  return { running, elapsedSec, run, cancel }
}
