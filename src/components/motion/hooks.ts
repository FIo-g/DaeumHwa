'use client'

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void) {
  const query = window.matchMedia?.(QUERY)
  query?.addEventListener('change', callback)
  return () => query?.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia?.(QUERY).matches ?? false
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useReplay() {
  const [replayKey, setReplayKey] = useState(0)
  return { replayKey, replay: () => setReplayKey((value) => value + 1) }
}

export function useEntered(ref: RefObject<HTMLElement | null>, enabled = true) {
  const reduced = usePrefersReducedMotion()
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!enabled || reduced || entered || !node || typeof IntersectionObserver === 'undefined')
      return

    let active = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!active || !entry?.isIntersecting) return
      setEntered(true)
      observer.disconnect()
    })
    observer.observe(node)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [enabled, entered, reduced, ref])

  return entered
}
