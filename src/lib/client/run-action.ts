import { toast } from 'sonner'
import type { ActionResult } from '@/lib/result'

/**
 * Awaits a server action from a client component. Failures show a toast and resolve to null;
 * successes resolve to the data and optionally show a success toast.
 */
export async function runAction<T>(
  promise: Promise<ActionResult<T>>,
  options?: { success?: string },
): Promise<T | null> {
  let result: ActionResult<T>
  try {
    result = await promise
  } catch {
    toast.error('잠시 후 다시 시도해 주세요.')
    return null
  }
  if (!result.ok) {
    toast.error(result.error.message)
    return null
  }
  if (options?.success) toast.success(options.success)
  return result.data
}
