const layoutAttributes = ['style', 'class', 'hidden', 'open', 'aria-hidden', 'data-state']

export function observeProofLayout(
  root: Element,
  elements: (Element | null)[],
  measure: () => void,
  extraAttributes: string[] = [],
) {
  let active = true
  let frame = 0
  const schedule = () => {
    if (!active || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }

  measure()
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  for (const element of elements) {
    if (element) resize?.observe(element)
  }

  const content = new MutationObserver(schedule)
  content.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
    attributeFilter: [...layoutAttributes, ...extraAttributes],
  })
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    content.observe(ancestor, { attributeFilter: layoutAttributes })
  }

  void document.fonts?.ready.then(schedule)
  document.fonts?.addEventListener('loadingdone', schedule)
  document.fonts?.addEventListener('loadingerror', schedule)
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, true)

  return () => {
    active = false
    cancelAnimationFrame(frame)
    resize?.disconnect()
    content.disconnect()
    document.fonts?.removeEventListener('loadingdone', schedule)
    document.fonts?.removeEventListener('loadingerror', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('scroll', schedule, true)
  }
}

export function inverseScreenMatrix(svg: SVGSVGElement | null) {
  const matrix = svg?.getScreenCTM?.()
  if (!matrix || matrix.a * matrix.d === matrix.b * matrix.c) return null
  return matrix.inverse()
}
