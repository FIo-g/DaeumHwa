import type {
  aiRuns,
  changeLog,
  chapterVersions,
  chapters,
  comments,
  entryAppearances,
  facts,
  importJobs,
  interviewSessions,
  interviewTurns,
  issues,
  namingRules,
  proposals,
  relations,
  scheduleItems,
  styleCards,
  threadEntries,
  threadEvents,
  threads,
  userWorkState,
  wikiEntries,
  workInvites,
  workMembers,
  works,
} from './schema'

// ---- Status unions (text columns, validated with zod where user input arrives) ----

export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const ENTRY_KINDS = [
  'character',
  'place',
  'organization',
  'item',
  'rule',
  'event',
  'term',
  'other',
] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

export const FACT_STATUSES = ['confirmed', 'assumed', 'undecided'] as const
export type FactStatus = (typeof FACT_STATUSES)[number]

export const FACT_SOURCE_TYPES = ['chapter', 'interview', 'author', 'import'] as const
export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number]

/** What an interview question asks: fill a setting gap, or plan the next story beats. */
export const INTERVIEW_FOCUSES = ['setting', 'story'] as const
export type InterviewFocus = (typeof INTERVIEW_FOCUSES)[number]

export const THREAD_STATUSES = [
  'planned',
  'planted',
  'developing',
  'resolved',
  'discarded',
] as const
export type ThreadStatus = (typeof THREAD_STATUSES)[number]

export const THREAD_EVENT_KINDS = ['planted', 'developed', 'resolved', 'discarded', 'note'] as const
export type ThreadEventKind = (typeof THREAD_EVENT_KINDS)[number]

export const IMPORTANCE = ['low', 'medium', 'high'] as const
export type Importance = (typeof IMPORTANCE)[number]

export const PROPOSER_TYPES = ['ai', 'author'] as const
export type ProposerType = (typeof PROPOSER_TYPES)[number]

export const PROPOSAL_TYPES = [
  'entry_create',
  'entry_update',
  'fact_create',
  'thread_create',
  'thread_event',
  'relation_create',
  'chapter_summary',
  'style_card',
] as const
export type ProposalType = (typeof PROPOSAL_TYPES)[number]

export const PROPOSAL_SOURCES = ['interview', 'import', 'post_chapter', 'style', 'manual'] as const
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number]

export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const CHANGE_ACTIONS = ['create', 'update', 'archive', 'restore', 'revert'] as const
export type ChangeAction = (typeof CHANGE_ACTIONS)[number]

export const CHANGE_TARGETS = [
  'wiki_entries',
  'facts',
  'threads',
  'thread_events',
  'relations',
  'naming_rules',
  'style_cards',
  'chapters',
] as const
export type ChangeTargetTable = (typeof CHANGE_TARGETS)[number]

export const ISSUE_KINDS = [
  'contradiction',
  'naming',
  'timeline',
  'thread',
  'character',
  'other',
] as const
export type IssueKind = (typeof ISSUE_KINDS)[number]

export const SEVERITIES = ['high', 'medium', 'low'] as const
export type Severity = (typeof SEVERITIES)[number]

export const ISSUE_STATUSES = ['open', 'accepted', 'dismissed', 'wiki_updated'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const CHAPTER_STATUSES = ['draft', 'done'] as const
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

export const VERSION_SOURCES = ['save', 'restore', 'import', 'ai_draft'] as const
export type VersionSource = (typeof VERSION_SOURCES)[number]

export const IMPORT_STATUSES = [
  'uploading',
  'queued',
  'running',
  'paused',
  'done',
  'error',
  'cancelled',
] as const
export type ImportJobStatus = (typeof IMPORT_STATUSES)[number]

export const SCHEDULE_KINDS = ['deadline', 'publish', 'hiatus', 'event'] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

export const AI_TASKS = [
  'interview-question',
  'interview-extract',
  'chapter-extract',
  'continuity-check',
  'proofread',
  'reader-sim',
  'direction-advice',
  'draft-chapter',
  'style-suggest',
  'draft-continue',
  'paragraph-trim',
  'draft-repair',
  'draft-beats',
  'scene-rewrite',
  'chapter-extract-facts',
  'chapter-extract-threads',
  'chapter-extract-relations',
] as const
export type AiTaskName = (typeof AI_TASKS)[number]

export const AI_RUN_STATUSES = ['running', 'done', 'error'] as const
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number]

/** Numbers-only usage events (stage 0). Stages 1–3 add kinds. */
export const USAGE_EVENT_KINDS = ['draft_started', 'draft_used', 'draft_edit_ratio'] as const
export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number]

// ---- Actor and work settings ----

export type Actor = { userId: string }

export interface WorkSettings {
  /** Warn when a character has not appeared for this many chapters. */
  absenceThreshold?: number
  /** Publish weekdays, 0 = Sunday ... 6 = Saturday. */
  publishDays?: number[]
  chaptersPerPublishDay?: number
  bufferTarget?: number
  targetChars?: number
}

export const DEFAULT_WORK_SETTINGS: Required<WorkSettings> = {
  absenceThreshold: 10,
  publishDays: [1, 2, 3, 4, 5],
  chaptersPerPublishDay: 1,
  bufferTarget: 5,
  targetChars: 5500,
}

export function resolveWorkSettings(s?: WorkSettings | null): Required<WorkSettings> {
  return {
    absenceThreshold: s?.absenceThreshold ?? DEFAULT_WORK_SETTINGS.absenceThreshold,
    publishDays: s?.publishDays ?? [...DEFAULT_WORK_SETTINGS.publishDays],
    chaptersPerPublishDay: s?.chaptersPerPublishDay ?? DEFAULT_WORK_SETTINGS.chaptersPerPublishDay,
    bufferTarget: s?.bufferTarget ?? DEFAULT_WORK_SETTINGS.bufferTarget,
    targetChars: s?.targetChars ?? DEFAULT_WORK_SETTINGS.targetChars,
  }
}

// ---- Row types ----

export type WorkRow = typeof works.$inferSelect
export type MemberRow = typeof workMembers.$inferSelect
export type InviteRow = typeof workInvites.$inferSelect
export type ChapterRow = typeof chapters.$inferSelect
export type ChapterVersionRow = typeof chapterVersions.$inferSelect
export type EntryRow = typeof wikiEntries.$inferSelect
export type AppearanceRow = typeof entryAppearances.$inferSelect
export type FactRow = typeof facts.$inferSelect
export type ThreadRow = typeof threads.$inferSelect
export type ThreadEventRow = typeof threadEvents.$inferSelect
export type ThreadEntryRow = typeof threadEntries.$inferSelect
export type RelationRow = typeof relations.$inferSelect
export type NamingRuleRow = typeof namingRules.$inferSelect
export type StyleCardRow = typeof styleCards.$inferSelect
export type ProposalRow = typeof proposals.$inferSelect
export type ChangeRow = typeof changeLog.$inferSelect
export type IssueRow = typeof issues.$inferSelect
export type CommentRow = typeof comments.$inferSelect
export type InterviewSessionRow = typeof interviewSessions.$inferSelect
export type InterviewTurnRow = typeof interviewTurns.$inferSelect
export type ImportJobRow = typeof importJobs.$inferSelect
export type ScheduleItemRow = typeof scheduleItems.$inferSelect
export type AiRunRow = typeof aiRuns.$inferSelect
export type UserWorkStateRow = typeof userWorkState.$inferSelect

// ---- Shared input/output shapes ----

export interface ScheduleInput {
  settings: Required<WorkSettings>
  chapters: {
    id: string
    position: number
    title: string
    status: ChapterStatus
    publishedOn: string | null
  }[]
  items: {
    id: string
    kind: ScheduleKind
    title: string
    date: string
    endDate: string | null
    done: boolean
  }[]
}

export interface ExportPayload {
  format: 'daeumhwa-backup'
  version: 1
  /** ISO string; timestamps inside rows may arrive as ISO strings after JSON. */
  exportedAt: string
  work: WorkRow
  chapters: ChapterRow[]
  chapterVersions: ChapterVersionRow[]
  comments: CommentRow[]
  issues: IssueRow[]
  proposals: ProposalRow[]
  interviewSessions: InterviewSessionRow[]
  interviewTurns: InterviewTurnRow[]
  aiRuns: AiRunRow[]
  entries: EntryRow[]
  facts: FactRow[]
  threads: ThreadRow[]
  threadEvents: ThreadEventRow[]
  threadEntries: { threadId: string; entryId: string }[]
  relations: RelationRow[]
  namingRules: NamingRuleRow[]
  styleCards: StyleCardRow[]
  changes: ChangeRow[]
  scheduleItems: ScheduleItemRow[]
}
