const KEY_PREFIX = 'daeumhwa:sample-chapter:'

function keyFor(chapterId: string): string {
  return `${KEY_PREFIX}${chapterId}`
}

/**
 * Remembers that this tab is showing a sample chapter. The demo query drops from the URL after
 * the auto check starts, so the banner and the check tab need a per-tab flag to stay put.
 */
export function markSampleChapter(chapterId: string): void {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(keyFor(chapterId), '1')
  } catch {
    // Private windows and disabled storage must not break the demo screen.
  }
}

export function isSampleChapter(chapterId: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem(keyFor(chapterId)) !== null
  } catch {
    return false
  }
}
