'use client'

import { useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'

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

export function usePointerTilt() {
  const reduced = usePrefersReducedMotion()
  const lastMove = useRef(-Infinity)

  function reset(event: PointerEvent<HTMLElement>) {
    const { style } = event.currentTarget
    for (const name of ['--b-rx', '--b-ry', '--b-px', '--b-py']) style.removeProperty(name)
    lastMove.current = -Infinity
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== 'mouse' || event.timeStamp - lastMove.current < 16) {
      return
    }
    const target = event.currentTarget
    const box = target.getBoundingClientRect()
    if (!box.width || !box.height) return

    const x = Math.max(-1, Math.min(1, (2 * (event.clientX - box.left)) / box.width - 1))
    const y = Math.max(-1, Math.min(1, (2 * (event.clientY - box.top)) / box.height - 1))
    lastMove.current = event.timeStamp
    target.style.setProperty('--b-rx', `${-5 * y}deg`)
    target.style.setProperty('--b-ry', `${7 * x}deg`)
    target.style.setProperty('--b-px', `${10 * x}px`)
    target.style.setProperty('--b-py', `${8 * y}px`)
  }

  return { onPointerMove: move, onPointerLeave: reset, onPointerCancel: reset }
}
