export function readMotionDuration(
  element: Element,
  token: '--b-step' | '--b-cycle',
  fallback: number,
): number {
  const duration = getComputedStyle(element).getPropertyValue(token).trim()
  const value = Number.parseFloat(duration)
  if (!Number.isFinite(value)) return fallback
  return duration.endsWith('ms') ? value : value * 1000
}
