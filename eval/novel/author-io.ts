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
import { ISSUE_KINDS, PROPOSAL_TYPES, SEVERITIES } from '@/db/types'
import type { ChapterMetrics } from './metrics'

// File protocol between the eval runner and the human (or fake) author. The runner writes
// pending.json and waits for answer.json; a bad answer is moved aside and the pending item stays.

const PENDING_FILE = 'pending.json'
const ANSWER_FILE = 'answer.json'
const ERROR_FILE = 'answer.error.txt'
const DECISIONS_FILE = 'author-decisions.jsonl'

const MetricsSchema: z.ZodType<ChapterMetrics> = z.object({
  chars: z.number(),
  targetChars: z.number(),
  lengthOk: z.boolean(),
  foreignRuns: z.array(z.string()),
  metaHits: z.array(z.string()),
  endsCleanly: z.boolean(),
  paragraphs: z.number(),
  avgParagraphChars: z.number(),
  dialogueLineRatio: z.number(),
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

export function logDecision(dir: string, p: Pending, a: Answer): void {
  mkdirSync(dir, { recursive: true })
  const line = { at: new Date().toISOString(), step: p.step, kind: p.kind, answer: a }
  appendFileSync(path.join(dir, DECISIONS_FILE), `${JSON.stringify(line)}\n`)
}
