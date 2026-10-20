import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { AdviceSchema } from '@/ai/tasks/direction-advice'
import { ISSUE_KINDS, PROPOSAL_TYPES, type ProposalType, SEVERITIES } from '@/db/types'
import type { ChapterMetrics, SceneLengths } from './metrics'

// File protocol between the eval runner and the human (or fake) author. The runner writes
// pending.json and waits for answer.json; a bad answer is moved aside and the pending item stays.

const PENDING_FILE = 'pending.json'
const ANSWER_FILE = 'answer.json'
const ERROR_FILE = 'answer.error.txt'
export const DECISIONS_FILE = 'author-decisions.jsonl'

const MetricsSchema: z.ZodType<ChapterMetrics, unknown> = z.object({
  chars: z.number(),
  targetChars: z.number(),
  lengthOk: z.boolean(),
  foreignRuns: z.array(z.string()),
  metaHits: z.array(z.string()),
  endsCleanly: z.boolean(),
  paragraphs: z.number(),
  avgParagraphChars: z.number(),
  dialogueLineRatio: z.number(),
  // Saved runs from before E2 lack these two keys; the defaults keep them readable.
  sampleCopyHits: z.number().default(0),
  repeatedWords: z.array(z.object({ word: z.string(), count: z.number() })).default([]),
  // Saved runs from before E1 lack this key.
  overlongParagraphs: z.number().default(0),
  // Saved runs from before P8 lack this key.
  paragraphOpeners: z
    .object({
      counted: z.number(),
      repeated: z.number(),
      top: z.array(z.object({ word: z.string(), count: z.number() })),
    })
    .default({ counted: 0, repeated: 0, top: [] }),
  // Stage 1 lengths; saved runs from before stage 1 lack this key.
  sceneLengths: z
    .object({
      scenes: z.number(),
      targets: z.array(z.number()).nullable(),
      chars: z.array(z.number()),
      within: z.number().nullable(),
    })
    .default({ scenes: 0, targets: null, chars: [], within: null }) as z.ZodType<SceneLengths>,
})

const ProposalItemSchema = z.object({
  id: z.string(),
  type: z.enum(PROPOSAL_TYPES),
  payload: z.record(z.string(), z.unknown()),
})

const ProofreadItemSchema = z.object({
  id: z.string(),
  quote: z.string(),
  replacement: z.string(),
  kind: z.string(),
  reason: z.string(),
  source: z.string(),
})

const ContinuityItemSchema = z.object({
  id: z.string(),
  kind: z.enum(ISSUE_KINDS),
  severity: z.enum(SEVERITIES),
  quote: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
})

export const PendingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interview_answer'),
    step: z.string(),
    turnId: z.string(),
    focus: z.enum(['setting', 'story']),
    topic: z.string(),
    question: z.string(),
    asked: z.number().int(),
    limit: z.number().int(),
  }),
  z.object({
    kind: z.literal('proposals'),
    step: z.string(),
    source: z.enum(['interview', 'post_chapter', 'style']),
    chapter: z.number().int().nullable(),
    chapterFile: z.string().nullable(),
    items: z.array(ProposalItemSchema),
  }),
  z.object({
    kind: z.literal('draft_review'),
    step: z.string(),
    chapter: z.number().int(),
    attempt: z.number().int(),
    maxAttempts: z.number().int(),
    instructions: z.string(),
    mustInclude: z.array(z.string()),
    textFile: z.string(),
    metrics: MetricsSchema,
  }),
  z.object({
    kind: z.literal('plan_review'),
    step: z.string(),
    chapter: z.number().int(),
    card: z.string(),
    intention: z.string(),
    mustInclude: z.array(z.string()),
    round: z.number().int(),
  }),
  z.object({
    kind: z.literal('proofread'),
    step: z.string(),
    chapter: z.number().int(),
    textFile: z.string(),
    items: z.array(ProofreadItemSchema),
  }),
  z.object({
    kind: z.literal('continuity'),
    step: z.string(),
    chapter: z.number().int(),
    textFile: z.string(),
    items: z.array(ContinuityItemSchema),
  }),
  z.object({
    kind: z.literal('advice_note'),
    step: z.string(),
    chapter: z.number().int(),
    result: AdviceSchema,
    nextInstructions: z.string(),
  }),
])

export type Pending = z.infer<typeof PendingSchema>

export const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interview_answer'),
    answer: z.string(),
    bankKeys: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('proposals'),
    decisions: z.array(z.object({ id: z.string(), approve: z.boolean(), reason: z.string() })),
  }),
  z.object({
    kind: z.literal('draft_review'),
    usable: z.boolean(),
    quality: z.number().int().min(1).max(5),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('proofread'),
    decisions: z.array(z.object({ id: z.string(), accept: z.boolean(), reason: z.string() })),
  }),
  z.object({
    kind: z.literal('continuity'),
    decisions: z.array(z.object({ id: z.string(), valid: z.boolean(), reason: z.string() })),
  }),
  z.object({
    kind: z.literal('advice_note'),
    matchingOption: z.number().int().nullable(),
    note: z.string(),
  }),
  // approve false needs a note of 1 to 150 characters; answerProblems checks that.
  z.object({
    kind: z.literal('plan_review'),
    approve: z.boolean(),
    note: z.string().max(150).optional(),
  }),
])

export type Answer = z.infer<typeof AnswerSchema>

/** Pending kinds whose answer carries one decision per item id. */
function itemIds(p: Pending): string[] | null {
  if (p.kind === 'proposals' || p.kind === 'proofread' || p.kind === 'continuity') {
    return p.items.map((item) => item.id)
  }
  return null
}

function answerIds(a: Answer): string[] {
  if (a.kind === 'proposals' || a.kind === 'proofread' || a.kind === 'continuity') {
    return a.decisions.map((decision) => decision.id)
  }
  return []
}

/** Returns every problem with the answer, or an empty list when it is usable. */
function answerProblems(answer: Answer, p: Pending): string[] {
  if (answer.kind === 'plan_review' && !answer.approve && !(answer.note ?? '').trim()) {
    return ['note is required when approve is false']
  }
  const expected = itemIds(p)
  if (!expected) return []
  const given = answerIds(answer)
  const problems: string[] = []
  const seen = new Set<string>()
  for (const id of given) {
    if (seen.has(id)) problems.push(`duplicate id: ${id}`)
    seen.add(id)
  }
  for (const id of expected) {
    if (!seen.has(id)) problems.push(`missing id: ${id}`)
  }
  for (const id of seen) {
    if (!expected.includes(id)) problems.push(`unknown id: ${id}`)
  }
  return problems
}

export function writePending(dir: string, p: Pending): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, PENDING_FILE), `${JSON.stringify(p, null, 2)}\n`)
  rmSync(path.join(dir, ANSWER_FILE), { force: true })
  rmSync(path.join(dir, ERROR_FILE), { force: true })
}

export function readPending(dir: string): Pending | null {
  const file = path.join(dir, PENDING_FILE)
  if (!existsSync(file)) return null
  const parsed = PendingSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success) throw new Error(`pending.json is invalid: ${parsed.error.message}`)
  return parsed.data
}

/**
 * Reads the author's answer for the pending item. Returns null when there is no answer yet, or
 * when the answer is invalid. An invalid answer is moved to answer.rejected-<n>.json and the
 * problem is written to answer.error.txt; the pending item stays in place.
 */
export function readAnswer(dir: string, p: Pending): Answer | null {
  const file = path.join(dir, ANSWER_FILE)
  if (!existsSync(file)) return null

  const problem = parseProblem(readFileSync(file, 'utf8'), p)
  if (typeof problem !== 'string') return problem

  renameSync(file, path.join(dir, `answer.rejected-${nextRejectedIndex(dir)}.json`))
  writeFileSync(path.join(dir, ERROR_FILE), `${problem}\n`)
  return null
}

/** Returns the parsed answer, or the problem as a string. */
function parseProblem(raw: string, p: Pending): Answer | string {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return `Invalid JSON: ${(error as Error).message}`
  }
  const kind = (json as { kind?: unknown } | null)?.kind
  if (kind !== p.kind) return `kind mismatch: expected ${p.kind}, got ${String(kind)}`

  const parsed = AnswerSchema.safeParse(json)
  if (!parsed.success) {
    return `Schema error: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
  }
  const problems = answerProblems(parsed.data, p)
  if (problems.length > 0) return problems.join('; ')
  return parsed.data
}

function nextRejectedIndex(dir: string): number {
  const indexes = readdirSync(dir)
    .map((name) => /^answer\.rejected-(\d+)\.json$/.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
  return indexes.length === 0 ? 1 : Math.max(...indexes) + 1
}

export function clearPending(dir: string): void {
  rmSync(path.join(dir, PENDING_FILE), { force: true })
  rmSync(path.join(dir, ANSWER_FILE), { force: true })
}

const LABEL_MAX = 120

/**
 * A short, human-readable name for a proposal, used in the decision log and in duplicate hints.
 * Returns '' when the fields it needs are missing or not strings.
 */
export function proposalLabel(type: ProposalType, payload: Record<string, unknown>): string {
  const text = (name: string): string => {
    const value = payload[name]
    return typeof value === 'string' ? value.trim() : ''
  }
  // Composite labels need every part; a partial one would read as a different item.
  const joined = (...parts: string[]): string => (parts.some((part) => !part) ? '' : parts.join(''))
  let label: string
  switch (type) {
    case 'entry_create':
      label = text('name')
      break
    case 'entry_update':
      label = text('entryName')
      break
    case 'fact_create':
      label = joined(text('subjectName'), ': ', text('content'))
      break
    case 'thread_create':
      label = text('title')
      break
    case 'thread_event':
      label = joined(text('threadTitle'), ': ', text('kind'))
      break
    case 'relation_create':
      label = joined(text('sourceName'), ' -> ', text('targetName'), ' (', text('kind'), ')')
      break
    case 'chapter_summary':
      label = text('summary')
      break
    case 'style_card':
      label = text('name')
      break
  }
  return label.slice(0, LABEL_MAX)
}

/** Item-level detail for proposal decisions, so a later reader can match a card by its name. */
function decisionDetail(p: Pending, a: Answer): Record<string, unknown> {
  if (p.kind === 'interview_answer') return { topic: p.topic, question: p.question }
  if (p.kind !== 'proposals' || a.kind !== 'proposals') return {}
  const byId = new Map(p.items.map((item) => [item.id, item]))
  const items = []
  for (const decision of a.decisions) {
    const item = byId.get(decision.id)
    if (!item) continue
    items.push({
      id: item.id,
      type: item.type,
      label: proposalLabel(item.type, item.payload),
      approve: decision.approve,
      reason: decision.reason,
    })
  }
  return { items }
}

export function logDecision(dir: string, p: Pending, a: Answer): void {
  mkdirSync(dir, { recursive: true })
  const line = {
    at: new Date().toISOString(),
    step: p.step,
    kind: p.kind,
    answer: a,
    ...decisionDetail(p, a),
  }
  appendFileSync(path.join(dir, DECISIONS_FILE), `${JSON.stringify(line)}\n`)
}
