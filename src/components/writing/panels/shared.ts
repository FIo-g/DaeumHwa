import { toast } from 'sonner'
import type { Role } from '@/db/types'
import { locateQuote } from '@/lib/korean/sentences'
import type { WorkspaceApi, WritingData } from '../types'

// Helpers shared by the side panels. Client-safe: no server or DB imports.

const ROLE_RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }

/** Mirrors the role table in spec 3.3 for buttons. The server still checks every action. */
export function hasMinRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

/** Editors may change the chapter text and run AI. Archived chapters are read-only. */
export function canEditChapter(data: WritingData): boolean {
  return hasMinRole(data.role, 'editor') && !data.chapter.archivedAt
}

/** Finds a quote in the current text, preferring the hinted offset. */
export function rangeOf(
  text: string,
  quote: string,
  hint?: number | null,
): { start: number; end: number } | null {
  if (quote === '') return null
  return locateQuote(text, quote, hint ?? undefined)
}

/** Shown under a disabled write control, so the reason is visible without hovering. */
export const EDITOR_ONLY_NOTE = '편집자 이상만 실행할 수 있습니다.'

/**
 * Shows a toast with 되돌리기 after a panel edit. `before` is the whole text from before the edit.
 * Undo restores it only while the text still matches what the edit left, so later typing is never lost.
 */
export function offerUndo(api: WorkspaceApi, before: string, message: string): void {
  const after = api.getText()
  toast(message, {
    action: {
      label: '되돌리기',
      onClick: () => {
        if (api.getText() !== after) {
          toast.error('그 사이 원고가 바뀌어 되돌릴 수 없습니다.')
          return
        }
        api.replaceRange(0, after.length, before)
      },
    },
  })
}
