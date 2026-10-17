import { Inngest } from 'inngest'

// Inngest client for background jobs. Without INNGEST_EVENT_KEY (or INNGEST_DEV) the app runs
// import jobs from the browser instead, through the advance route.

export const inngest = new Inngest({ id: 'daeumhwa' })

/**
 * Reads INNGEST_DEV the way the Inngest SDK does: '1' or 'true' (any case, surrounding spaces
 * ignored) turns dev mode on, '0', 'false' and 'undefined' turn it off, and any other value is
 * a dev server URL. A URL without a scheme gets http:// first, as the SDK adds it.
 */
function isInngestDevEnabled(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return false
  const flag = trimmed.toLowerCase()
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false' || flag === 'undefined') return false
  try {
    return Boolean(new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`))
  } catch {
    return false
  }
}

/** True when background jobs go through Inngest. */
export function isInngestEnabled(): boolean {
  return !!process.env.INNGEST_EVENT_KEY || isInngestDevEnabled(process.env.INNGEST_DEV)
}
