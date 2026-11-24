'use client'

import dynamic from 'next/dynamic'
import { Component, memo, type ReactNode, useEffect, useRef, useState } from 'react'
import type { ForceGraphRendererProps } from './force-graph-renderer'
import { readGraphFont, readGraphPalette } from './graph-style'

const ForceGraph2D = dynamic(() => import('./force-graph-2d'), {
  ssr: false,
  loading: GraphLoading,
})
const ForceGraph3D = dynamic(() => import('./force-graph-3d'), {
  ssr: false,
  loading: GraphLoading,
})

type Viewport = Pick<ForceGraphRendererProps, 'width' | 'height' | 'palette' | 'font'>
type GraphViewportProps = Omit<ForceGraphRendererProps, keyof Viewport> & {
  mode: '3d' | '2d'
  on3DUnavailable: () => void
}

function GraphLoading() {
  return (
    <div role="status" className="grid size-full min-h-72 place-items-center px-4">
      <p className="text-sm text-muted-foreground">관계 그래프를 불러오는 중이에요.</p>
    </div>
  )
}

class GraphErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError?.()
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.onError) return <GraphLoading />
    return (
      <p
        role="status"
        className="grid size-full place-items-center px-4 text-center text-sm text-muted-foreground"
      >
        그래프를 불러오지 못했어요. 목록에서도 카드와 관계를 볼 수 있어요.
      </p>
    )
  }
}

function supportsWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}

export const GraphViewport = memo(function GraphViewport({
  mode,
  on3DUnavailable,
  ...rendererProps
}: GraphViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [webglReady, setWebglReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = 1
    colorCanvas.height = 1
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true })

    function updateViewport() {
      if (!container) return
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width || !height) return
      const palette = readGraphPalette(container, colorContext)
      const font = readGraphFont(container)
      setViewport((previous) =>
        previous?.width === width &&
        previous.height === height &&
        previous.palette.ink === palette.ink &&
        previous.palette.paper === palette.paper &&
        previous.palette.grid === palette.grid &&
        previous.font === font
          ? previous
          : { width, height, palette, font },
      )
    }

    const frame = requestAnimationFrame(() => {
      updateViewport()
      if (supportsWebGL()) setWebglReady(true)
      else on3DUnavailable()
    })
    const sizeObserver = new ResizeObserver(updateViewport)
    sizeObserver.observe(container)
    const themeObserver = new MutationObserver(updateViewport)
    const options = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] }
    for (
      let ancestor: HTMLElement | null = container;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      themeObserver.observe(ancestor, options)
    }
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', updateViewport)
    container.addEventListener('webglcontextlost', on3DUnavailable, true)

    return () => {
      cancelAnimationFrame(frame)
      sizeObserver.disconnect()
      themeObserver.disconnect()
      scheme.removeEventListener('change', updateViewport)
      container.removeEventListener('webglcontextlost', on3DUnavailable, true)
    }
  }, [on3DUnavailable])

  let content: ReactNode
  if (rendererProps.data.nodes.length === 0) {
    content = (
      <p className="grid size-full place-items-center px-4 text-center text-sm text-muted-foreground">
        조건에 맞는 카드가 없어요.
      </p>
    )
  } else if (!viewport || (mode === '3d' && !webglReady)) {
    content = <GraphLoading />
  } else if (mode === '3d') {
    content = (
      <GraphErrorBoundary key="3d" onError={on3DUnavailable}>
        <ForceGraph3D {...rendererProps} {...viewport} />
      </GraphErrorBoundary>
    )
  } else {
    content = (
      <GraphErrorBoundary key="2d">
        <ForceGraph2D {...rendererProps} {...viewport} />
      </GraphErrorBoundary>
    )
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="관계 그래프"
      className="wg-graph-surface"
      data-force-graph
      data-mode={mode}
    >
      {content}
    </div>
  )
})
