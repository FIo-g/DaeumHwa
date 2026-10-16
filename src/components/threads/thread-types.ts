import type { EntryKind, Importance, ThreadEventKind, ThreadStatus } from '@/db/types'

// Plain data passed from the server pages to the thread components (no Date objects, no services).

export type ThreadEventItem = {
  id: string
  kind: ThreadEventKind
  chapterId: string | null
  chapterPosition: number | null
  chapterTitle: string | null
  note: string
  evidence: string
}

export type ThreadItem = {
  id: string
  title: string
  description: string
  status: ThreadStatus
  importance: Importance
  plantedChapterId: string | null
  plantedPosition: number | null
  targetChapterPosition: number | null
  overdue: boolean
  relatedEntries: { id: string; name: string }[]
  events: ThreadEventItem[]
}

export type ChapterOption = { id: string; position: number; title: string }

export type EntryOption = { id: string; name: string; kind: EntryKind }
