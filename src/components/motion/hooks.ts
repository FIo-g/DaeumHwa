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

export function useViewportEntrance(ref: RefObject<HTMLElement | null>, enabled = true) {
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!enabled || reduced || !node || typeof IntersectionObserver === 'undefined') return

    const { top, height } = node.getBoundingClientRect()
    if (!height || top < document.documentElement.clientHeight) return

    // The CSS timeline already started. Rewind it only while the whole scene is below the fold.
    node.style.setProperty('--wg-entry-play', 'paused')
    for (const animation of node.getAnimations?.({ subtree: true }) ?? []) {
      if (animation.playState === 'paused') animation.currentTime = 0
    }

    function release() {
      node?.style.removeProperty('--wg-entry-play')
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      release()
      observer.disconnect()
    })
    observer.observe(node)
    return () => {
      release()
      observer.disconnect()
    }
  }, [enabled, reduced, ref])
}
