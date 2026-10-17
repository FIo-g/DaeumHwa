import { z } from 'zod'
import {
  ENTRY_KINDS,
  FACT_STATUSES,
  IMPORTANCE,
  type ProposalSource,
  type ProposalType,
} from '@/db/types'
import { AppError } from '@/lib/errors'

// Payload shapes for proposals (spec §4.2). Stored as jsonb and re-validated on every insert.
// Entry patches use optional keys (a missing key means "unchanged"). Fields are records here;
// structured-output schemas for AI calls use arrays of {key, value} and convert before this point.

const EntryCreateSchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  name: z.string(),
  aliases: z.array(z.string()),
  summary: z.string(),
  fields: z.record(z.string(), z.string()),
})

const EntryUpdateSchema = z.object({
  entryId: z.string(),
  entryName: z.string(),
  patch: z.object({
    summary: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
})

const FactCreateSchema = z.object({
  subjectName: z.string(),
  entryId: z.string().nullable(),
  content: z.string(),
  suggestedStatus: z.enum(FACT_STATUSES),
  sourceChapterId: z.string().nullable(),
  evidence: z.string(),
  supersedesFactId: z.string().nullable(),
})

const ThreadCreateSchema = z.object({
  title: z.string(),
  description: z.string(),
  status: z.enum(['planned', 'planted']),
  plantedChapterId: z.string().nullable(),
  targetChapterPosition: z.number().int().nullable(),
  importance: z.enum(IMPORTANCE),
  relatedNames: z.array(z.string()),
  evidence: z.string(),
  events: z.array(
    z.object({
      kind: z.enum(['developed', 'resolved']),
      chapterId: z.string(),
      evidence: z.string(),
    }),
  ),
})

const ThreadEventSchema = z.object({
  threadId: z.string(),
  threadTitle: z.string(),
  kind: z.enum(['planted', 'developed', 'resolved', 'discarded']),
  chapterId: z.string().nullable(),
  note: z.string(),
  evidence: z.string(),
})

const RelationCreateSchema = z.object({
  sourceName: z.string(),
  targetName: z.string(),
  kind: z.string(),
  description: z.string(),
  directed: z.boolean(),
  startPosition: z.number().int().nullable(),
  evidence: z.string(),
})

const ChapterSummarySchema = z.object({
  chapterId: z.string(),
  summary: z.string(),
})

const StyleCardSchema = z.object({
  entryName: z.string().nullable(),
  name: z.string(),
  tone: z.string(),
  rules: z.string(),
  examples: z.string(),
})

export const PROPOSAL_PAYLOAD_SCHEMAS = {
  entry_create: EntryCreateSchema,
  entry_update: EntryUpdateSchema,
  fact_create: FactCreateSchema,
  thread_create: ThreadCreateSchema,
  thread_event: ThreadEventSchema,
  relation_create: RelationCreateSchema,
  chapter_summary: ChapterSummarySchema,
  style_card: StyleCardSchema,
} satisfies Record<ProposalType, z.ZodType>

export type ProposalPayloadMap = {
  [K in ProposalType]: z.infer<(typeof PROPOSAL_PAYLOAD_SCHEMAS)[K]>
}

/** Input for inserting a proposal. The payload is validated against its type's schema. */
export type NewProposal = {
  [K in ProposalType]: {
    type: K
    payload: ProposalPayloadMap[K]
    source: ProposalSource
    sourceRef: string | null
    chapterId: string | null
  }
}[ProposalType]

/**
 * Text key for duplicate checks: whitespace collapsed, trimmed, and trailing sentence marks
 * removed, so "검을 쓴다." and "검을 쓴다" compare equal.
 */
export function normalizeProposalText(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。…!?]+$/, '')
}

export function parseProposalPayload<K extends ProposalType>(
  type: K,
  payload: unknown,
): ProposalPayloadMap[K] {
  const schema: z.ZodType = PROPOSAL_PAYLOAD_SCHEMAS[type]
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError('VALIDATION', '제안 내용 형식이 올바르지 않습니다.', parsed.error.issues)
  }
  // The schema for K is selected by `type`, so the parsed output matches ProposalPayloadMap[K].
  return parsed.data as ProposalPayloadMap[K]
}
