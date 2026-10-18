import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type {
  AiRunStatus,
  AiTaskName,
  ChangeAction,
  ChangeTargetTable,
  ChapterStatus,
  EntryKind,
  FactSourceType,
  FactStatus,
  Importance,
  ImportJobStatus,
  InterviewFocus,
  IssueKind,
  IssueStatus,
  ProposalSource,
  ProposalStatus,
  ProposalType,
  ProposerType,
  Role,
  ScheduleKind,
  Severity,
  ThreadEventKind,
  ThreadStatus,
  VersionSource,
  WorkSettings,
} from './types'

// Domain tables. Wiki-type rows are archived via archived_at, never hard-deleted.
// Better Auth tables (user, session, account, verification) are re-exported at the bottom.

const createdAtColumn = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAtColumn = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const archivedAtColumn = () => timestamp('archived_at', { withTimezone: true })
const emptyTextArray = () => sql`'{}'::text[]`

export const works = pgTable('works', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  genre: text('genre').notNull().default(''),
  logline: text('logline').notNull().default(''),
  synopsis: text('synopsis').notNull().default(''),
  settings: jsonb('settings')
    .$type<WorkSettings>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
})

export const workMembers = pgTable(
  'work_members',
  {
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [primaryKey({ columns: [t.workId, t.userId] })],
)

export const workInvites = pgTable('work_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  role: text('role').$type<Role>().notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAtColumn(),
})

export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    status: text('status').$type<ChapterStatus>().notNull().default('draft'),
    publishedOn: date('published_on', { mode: 'string' }),
    summary: text('summary').notNull().default(''),
    charCount: integer('char_count').notNull().default(0),
    charCountNoSpaces: integer('char_count_no_spaces').notNull().default(0),
    version: integer('version').notNull().default(1),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('chapters_work_position_idx').on(t.workId, t.position)],
)

export const chapterVersions = pgTable(
  'chapter_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    charCount: integer('char_count').notNull().default(0),
    source: text('source').$type<VersionSource>().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('chapter_versions_chapter_version_idx').on(t.chapterId, t.version)],
)

export const wikiEntries = pgTable(
  'wiki_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<EntryKind>().notNull(),
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default(emptyTextArray()),
    summary: text('summary').notNull().default(''),
    body: text('body').notNull().default(''),
    fields: jsonb('fields')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    customFields: jsonb('custom_fields')
      .$type<{ key: string; value: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('wiki_entries_work_kind_idx').on(t.workId, t.kind)],
)

export const entryAppearances = pgTable(
  'entry_appearances',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => wikiEntries.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    mentionCount: integer('mention_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.chapterId] })],
)

export const facts = pgTable(
  'facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => wikiEntries.id, { onDelete: 'set null' }),
    subjectName: text('subject_name').notNull().default(''),
    content: text('content').notNull(),
    status: text('status').$type<FactStatus>().notNull().default('confirmed'),
    sourceType: text('source_type').$type<FactSourceType>().notNull().default('author'),
    sourceChapterId: uuid('source_chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    evidence: text('evidence').notNull().default(''),
    validFromPosition: integer('valid_from_position'),
    validToPosition: integer('valid_to_position'),
    supersededByFactId: uuid('superseded_by_fact_id'),
    createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('facts_work_idx').on(t.workId), index('facts_entry_idx').on(t.entryId)],
)

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').$type<ThreadStatus>().notNull().default('planned'),
    plantedChapterId: uuid('planted_chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    resolvedChapterId: uuid('resolved_chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    targetChapterPosition: integer('target_chapter_position'),
    importance: text('importance').$type<Importance>().notNull().default('medium'),
    createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('threads_work_idx').on(t.workId)],
)

export const threadEntries = pgTable(
  'thread_entries',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => wikiEntries.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.entryId] })],
)

export const threadEvents = pgTable('thread_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<ThreadEventKind>().notNull(),
  chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  note: text('note').notNull().default(''),
  evidence: text('evidence').notNull().default(''),
  createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
  archivedAt: archivedAtColumn(),
  createdAt: createdAtColumn(),
})

export const relations = pgTable(
  'relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    sourceEntryId: uuid('source_entry_id')
      .notNull()
      .references(() => wikiEntries.id, { onDelete: 'cascade' }),
    targetEntryId: uuid('target_entry_id')
      .notNull()
      .references(() => wikiEntries.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default(''),
    description: text('description').notNull().default(''),
    directed: boolean('directed').notNull().default(false),
    startPosition: integer('start_position'),
    endPosition: integer('end_position'),
    createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('relations_work_idx').on(t.workId)],
)

export const namingRules = pgTable(
  'naming_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    canonical: text('canonical').notNull(),
    variants: text('variants').array().notNull().default(emptyTextArray()),
    note: text('note').notNull().default(''),
    entryId: uuid('entry_id').references(() => wikiEntries.id, { onDelete: 'set null' }),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('naming_rules_work_idx').on(t.workId)],
)

export const styleCards = pgTable(
  'style_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => wikiEntries.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    tone: text('tone').notNull().default(''),
    rules: text('rules').notNull().default(''),
    examples: text('examples').notNull().default(''),
    createdByType: text('created_by_type').$type<ProposerType>().notNull().default('author'),
    archivedAt: archivedAtColumn(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('style_cards_work_idx').on(t.workId)],
)

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    type: text('type').$type<ProposalType>().notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    status: text('status').$type<ProposalStatus>().notNull().default('pending'),
    source: text('source').$type<ProposalSource>().notNull(),
    sourceRef: text('source_ref'),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note').notNull().default(''),
    appliedTargetId: uuid('applied_target_id'),
    createdAt: createdAtColumn(),
  },
  (t) => [index('proposals_work_status_idx').on(t.workId, t.status)],
)

export const changeLog = pgTable(
  'change_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    targetTable: text('target_table').$type<ChangeTargetTable>().notNull(),
    targetId: uuid('target_id').notNull(),
    action: text('action').$type<ChangeAction>().notNull(),
    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),
    proposerType: text('proposer_type').$type<ProposerType>().notNull(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'set null' }),
    revertsChangeId: uuid('reverts_change_id'),
    summary: text('summary').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('change_log_work_created_idx').on(t.workId, t.createdAt),
    index('change_log_target_idx').on(t.targetTable, t.targetId),
  ],
)

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    runId: uuid('run_id'),
    kind: text('kind').$type<IssueKind>().notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    quote: text('quote').notNull(),
    quoteStart: integer('quote_start'),
    quoteEnd: integer('quote_end'),
    entryId: uuid('entry_id').references(() => wikiEntries.id, { onDelete: 'set null' }),
    factId: uuid('fact_id').references(() => facts.id, { onDelete: 'set null' }),
    wikiExcerpt: text('wiki_excerpt').notNull().default(''),
    explanation: text('explanation').notNull().default(''),
    suggestion: text('suggestion').notNull().default(''),
    status: text('status').$type<IssueStatus>().notNull().default('open'),
    resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAtColumn(),
  },
  (t) => [index('issues_chapter_status_idx').on(t.chapterId, t.status)],
)

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    quote: text('quote').notNull().default(''),
    quoteStart: integer('quote_start'),
    quoteEnd: integer('quote_end'),
    status: text('status').$type<'open' | 'resolved'>().notNull().default('open'),
    resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('comments_chapter_idx').on(t.chapterId)],
)

export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workId: uuid('work_id')
    .notNull()
    .references(() => works.id, { onDelete: 'cascade' }),
  status: text('status').$type<'active' | 'completed'>().notNull().default('active'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
})

export const interviewTurns = pgTable('interview_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => interviewSessions.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull().default(''),
  question: text('question').notNull(),
  rationale: text('rationale').notNull().default(''),
  focus: text('focus').$type<InterviewFocus>().notNull().default('setting'),
  answer: text('answer'),
  skipped: boolean('skipped').notNull().default(false),
  proposalCount: integer('proposal_count').notNull().default(0),
  createdAt: createdAtColumn(),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
})

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    status: text('status').$type<ImportJobStatus>().notNull().default('uploading'),
    chapterIds: uuid('chapter_ids').array().notNull(),
    cursor: integer('cursor').notNull().default(0),
    totalChapters: integer('total_chapters').notNull().default(0),
    processedChapters: integer('processed_chapters').notNull().default(0),
    proposalCount: integer('proposal_count').notNull().default(0),
    state: jsonb('state')
      .$type<{
        knownEntities: { name: string; kind: EntryKind; aliases: string[] }[]
        threadTitles: string[]
        /** Chapters an author skipped after they stopped the job (imports.ts). */
        skipped?: { chapterId: string; position: number; title: string; reason: string }[]
        /** Work-in-progress marker stored by imports.ts: the cursor and the time it was set. */
        inFlight?: { cursor: number; at: string }
      }>()
      .notNull()
      .default(sql`'{"knownEntities":[],"threadTitles":[]}'::jsonb`),
    error: text('error'),
    runner: text('runner').$type<'client' | 'inngest'>().notNull().default('client'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('import_jobs_work_idx').on(t.workId)],
)

export const scheduleItems = pgTable(
  'schedule_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ScheduleKind>().notNull(),
    title: text('title').notNull().default(''),
    date: date('date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    done: boolean('done').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('schedule_items_work_date_idx').on(t.workId, t.date)],
)

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id').references(() => works.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    task: text('task').$type<AiTaskName>().notNull(),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    status: text('status').$type<AiRunStatus>().notNull().default('running'),
    model: text('model').notNull().default(''),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    output: jsonb('output').$type<unknown>(),
    error: text('error'),
    createdAt: createdAtColumn(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('ai_runs_user_created_idx').on(t.userId, t.createdAt)],
)

export const userWorkState = pgTable(
  'user_work_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    lastChapterId: uuid('last_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    lastCursor: integer('last_cursor'),
    lastPath: text('last_path').notNull().default(''),
    updatedAt: updatedAtColumn(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workId] })],
)

export * from './auth-schema'
