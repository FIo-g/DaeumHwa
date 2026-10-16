import { Inngest } from 'inngest'

// Inngest client for background jobs. Without INNGEST_EVENT_KEY (or INNGEST_DEV=1) the app runs
// import jobs from the browser instead, through the advance route.

export const inngest = new Inngest({ id: 'daeumhwa' })

/** True when background jobs go through Inngest. */
export function isInngestEnabled(): boolean {
  return !!process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV === '1'
}
