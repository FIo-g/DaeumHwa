import type { ChapterRow, EntryKind, IssueRow, Role } from '@/db/types'
import type { CommentView } from '@/server/comments'
import type { ThreadView } from '@/server/threads'

// Shared contract for the writing screen. T19 (side panels) depends on these exact names.

export type HighlightKind = 'issue' | 'spelling' | 'comment' | 'reader' | 'naming' | 'search'

/** A marked range of the body. `start` and `end` are UTF-16 offsets, end exclusive. */
export type Highlight = {
  id: string
  start: number
  end: number
  kind: HighlightKind
  active?: boolean
}

/** Everything the writing screen needs, loaded on the server and passed down as plain data. */
export type WritingData = {
  workId: string
  workTitle: string
  role: Role
  demo: boolean
  targetChars: number
  chapter: ChapterRow
  chapters: { id: string; position: number; title: string }[]
  entries: { id: string; kind: EntryKind; name: string; aliases: string[]; summary: string }[]
  namingRules: { id: string; canonical: string; variants: string[] }[]
  threads: ThreadView[]
  issues: IssueRow[]
  comments: CommentView[]
  pendingProposalCount: number
}

export type SelectionRange = { start: number; end: number; text: string }

/** Operations the side panels may call on the editor. Offsets are UTF-16 indices. */
export type WorkspaceApi = {
  getText(): string
  replaceRange(start: number, end: number, replacement: string): void
  replaceQuote(quote: string, replacement: string, hintStart?: number): boolean
  appendText(text: string): void
  setHighlights(source: string, highlights: Highlight[]): void
  focusRange(start: number, end: number): void
  getSelection(): SelectionRange | null
  saveNow(): Promise<void>
  refresh(): void
}

export type WritingSidePanelProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
  position: number
}
