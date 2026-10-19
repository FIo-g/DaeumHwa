import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Db } from '@/db/client'
import type { Actor, EntryRow } from '@/db/types'
import { listFacts, type FactView } from '@/server/facts'
import { listRelations, type RelationView } from '@/server/relations'
import { listThreads, type ThreadView } from '@/server/threads'
import { listEntries } from '@/server/wiki'
import { DECISIONS_FILE, type Pending, proposalLabel } from './author-io'
import { pendingKey } from './steps/util'

// What the author agent reads before judging an interview answer or a proposal batch: the wiki the
// app has approved so far, the author's own earlier decisions, and duplicate hints. The hints are
// advice only; the author still decides. The runner rewrites the file on every wait.

const CONTEXT_FILE = 'author-context.json'
export const ENTRY_CAP = 80
export const FACT_CAP = 15
const UNATTACHED_FACT_CAP = 30
const SUMMARY_CAP = 160
const ANSWER_CAP = 200
const RECENT_CAP = 20
const INTERVIEW_CAP = 30

export type DecisionLine = {
  at: string
  step: string
  kind: string
  answer: unknown
  items?: { id: string; type: string; label: string; approve: boolean; reason: string }[]
  topic?: string
  question?: string
}

type DecisionItem = NonNullable<DecisionLine['items']>[number]

export type AuthorHint = {
  duplicateOf?: string
  previouslyRejected?: { step: string; reason: string }
  endpointRejected?: string[]
}

export type AuthorContext = {
  pendingRef: { key: string; itemIds: string[] } // key = pendingKey(p); itemIds = proposal item ids, [] for other kinds
  wiki: {
    entries: {
      name: string
      kind: string
      aliases: string[]
      summary: string
      facts: { status: string; content: string }[]
    }[]
    unattachedFacts: { status: string; content: string }[]
    threads: { title: string; status: string }[]
    relations: { source: string; target: string; kind: string }[]
    truncated: boolean
  }
  decisions: {
    rejected: { step: string; type: string; label: string; reason: string }[]
    approvedCount: number
    recentApproved: string[]
    interviewAnswers: { topic: string; question: string; answer: string; bankKeys: string[] }[]
  }
  hints: Record<string, AuthorHint> // always present; {} unless pending.kind is 'proposals'
}

const DecisionItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  approve: z.boolean(),
  reason: z.string(),
})

const DecisionLineSchema = z.object({
  at: z.string(),
  step: z.string(),
  kind: z.string(),
  answer: z.unknown(),
  items: z.array(z.unknown()).optional(),
  topic: z.string().optional(),
  question: z.string().optional(),
})

/** Text key for duplicate checks: lowercase, with whitespace, punctuation and symbols removed. */
export function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/** Reads the decision log. Missing file gives []; a line that is not a valid decision is skipped. */
export function readDecisions(dir: string): DecisionLine[] {
  const file = join(dir, DECISIONS_FILE)
  if (!existsSync(file)) return []
  const lines: DecisionLine[] = []
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue
    const line = parseLine(raw)
    if (line) lines.push(line)
  }
  return lines
}

function parseLine(raw: string): DecisionLine | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = DecisionLineSchema.safeParse(json)
  if (!parsed.success) return null
  const line = parsed.data
  // Items from older logs or hand edits may be partial; keep only the complete ones.
  const items = line.items?.flatMap((item) => {
    const checked = DecisionItemSchema.safeParse(item)
    return checked.success ? [checked.data] : []
  })
  return {
    at: line.at,
    step: line.step,
    kind: line.kind,
    answer: line.answer,
    items,
    topic: line.topic,
    question: line.question,
  }
}

function itemsOf(line: DecisionLine): DecisionItem[] {
  return line.items ?? []
}

/** The interview answer and its bank keys, or null when the logged answer has another shape. */
function interviewAnswerOf(answer: unknown): { answer: string; bankKeys: string[] } | null {
  if (typeof answer !== 'object' || answer === null) return null
  if (!('answer' in answer) || typeof answer.answer !== 'string') return null
  if (!('bankKeys' in answer) || !Array.isArray(answer.bankKeys)) return null
  const bankKeys = answer.bankKeys.filter((key): key is string => typeof key === 'string')
  if (bankKeys.length !== answer.bankKeys.length) return null
  return { answer: answer.answer, bankKeys }
}

function textField(payload: Record<string, unknown>, name: string): string {
  const value = payload[name]
  return typeof value === 'string' ? value : ''
}

function summarize(lines: DecisionLine[]): AuthorContext['decisions'] {
  const rejected: AuthorContext['decisions']['rejected'] = []
  const approved: string[] = []
  for (const line of lines) {
    for (const item of itemsOf(line)) {
      if (item.approve) approved.push(item.label)
      else
        rejected.push({ step: line.step, type: item.type, label: item.label, reason: item.reason })
    }
  }
  const interviewAnswers: AuthorContext['decisions']['interviewAnswers'] = []
  for (const line of lines) {
    if (line.kind !== 'interview_answer') continue
    const answer = interviewAnswerOf(line.answer)
    if (!answer) continue
    interviewAnswers.push({
      topic: line.topic ?? '',
      question: line.question ?? '',
      answer: answer.answer.slice(0, ANSWER_CAP),
      bankKeys: answer.bankKeys,
    })
  }
  return {
    rejected,
    approvedCount: approved.length,
    recentApproved: approved.slice(-RECENT_CAP),
    interviewAnswers: interviewAnswers.slice(-INTERVIEW_CAP),
  }
}

function summarizeWiki(
  entryRows: EntryRow[],
  factRows: FactView[],
  threadRows: ThreadView[],
  relationRows: RelationView[],
): AuthorContext['wiki'] {
  let truncated = entryRows.length > ENTRY_CAP
  const factsByEntry = new Map<string, FactView[]>()
  const unattached: FactView[] = []
  for (const fact of factRows) {
    if (fact.entryId === null) {
      unattached.push(fact)
      continue
    }
    const list = factsByEntry.get(fact.entryId) ?? []
    list.push(fact)
    factsByEntry.set(fact.entryId, list)
  }

  const entries = entryRows.slice(0, ENTRY_CAP).map((entry) => {
    const own = factsByEntry.get(entry.id) ?? []
    if (own.length > FACT_CAP) truncated = true
    return {
      name: entry.name,
      kind: entry.kind,
      aliases: entry.aliases,
      summary: entry.summary.slice(0, SUMMARY_CAP),
      facts: own.slice(0, FACT_CAP).map((fact) => ({ status: fact.status, content: fact.content })),
    }
  })
  if (unattached.length > UNATTACHED_FACT_CAP) truncated = true

  // listRelations does not hide relations whose endpoint card is archived, so filter here.
  const activeIds = new Set(entryRows.map((entry) => entry.id))
  const relations = relationRows
    .filter((row) => activeIds.has(row.sourceEntryId) && activeIds.has(row.targetEntryId))
    .map((row) => ({ source: row.sourceName, target: row.targetName, kind: row.kind }))

  return {
    entries,
    unattachedFacts: unattached
      .slice(0, UNATTACHED_FACT_CAP)
      .map((fact) => ({ status: fact.status, content: fact.content })),
    threads: threadRows.map((thread) => ({ title: thread.title, status: thread.status })),
    relations,
    truncated,
  }
}

/**
 * Duplicate and rejection hints for each item of a proposals batch. A hint names the match; the
 * author decides. Keys are normalized, so spacing and punctuation do not hide a repeat.
 */
function proposalHints(
  p: Extract<Pending, { kind: 'proposals' }>,
  entryRows: EntryRow[],
  factRows: FactView[],
  lines: DecisionLine[],
): Record<string, AuthorHint> {
  // Names and aliases of active cards, by normalized key.
  const cardKeys = new Map<string, string>()
  for (const entry of entryRows) {
    for (const name of [entry.name, ...entry.aliases]) {
      const key = normalizeKey(name)
      if (key && !cardKeys.has(key)) cardKeys.set(key, entry.name)
    }
  }
  // Facts of active cards, by normalized "name: content" (the fact_create label).
  const entryNames = new Map(entryRows.map((entry) => [entry.id, entry.name]))
  const factKeys = new Map<string, string>()
  for (const fact of factRows) {
    const name = fact.entryId ? entryNames.get(fact.entryId) : undefined
    if (name === undefined) continue
    const label = `${name}: ${fact.content}`
    const key = normalizeKey(label)
    if (key && !factKeys.has(key)) factKeys.set(key, label)
  }

  // Earlier decisions, keyed by `${type}|${key}`.
  const approvedEarlier = new Map<string, string>()
  const rejectedEarlier = new Map<string, { step: string; reason: string }>()
  const rejectedEntryKeys = new Set<string>()
  for (const line of lines) {
    for (const item of itemsOf(line)) {
      const key = normalizeKey(item.label)
      if (!key) continue
      const typeKey = `${item.type}|${key}`
      if (item.approve) {
        if (!approvedEarlier.has(typeKey)) approvedEarlier.set(typeKey, item.label)
        continue
      }
      rejectedEarlier.set(typeKey, { step: line.step, reason: item.reason })
      if (item.type === 'entry_create') rejectedEntryKeys.add(key)
    }
  }

  const hints: Record<string, AuthorHint> = {}
  const batchSeen = new Map<string, string>()
  for (const item of p.items) {
    const label = proposalLabel(item.type, item.payload)
    const key = normalizeKey(label)
    const hint: AuthorHint = {}
    if (key) {
      const typeKey = `${item.type}|${key}`
      const existing =
        item.type === 'entry_create'
          ? cardKeys.get(key)
          : item.type === 'fact_create'
            ? factKeys.get(key)
            : undefined
      const earlierInBatch = batchSeen.get(typeKey)
      const approved = approvedEarlier.get(typeKey)
      if (existing !== undefined) hint.duplicateOf = `existing wiki item: "${existing}"`
      else if (earlierInBatch !== undefined)
        hint.duplicateOf = `same item earlier in this batch: ${earlierInBatch}`
      else if (approved !== undefined) hint.duplicateOf = `approved earlier: "${approved}"`
      const previous = rejectedEarlier.get(typeKey)
      if (previous) hint.previouslyRejected = previous
      batchSeen.set(typeKey, item.id)
    }
    if (item.type === 'relation_create') {
      const endpointRejected = [
        textField(item.payload, 'sourceName'),
        textField(item.payload, 'targetName'),
      ].filter((name) => {
        const endpointKey = normalizeKey(name)
        return (
          endpointKey !== '' && rejectedEntryKeys.has(endpointKey) && !cardKeys.has(endpointKey)
        )
      })
      if (endpointRejected.length > 0) hint.endpointRejected = endpointRejected
    }
    if (Object.keys(hint).length > 0) hints[item.id] = hint
  }
  return hints
}

/** Counts exact duplicate approvals and approvals of a card rejected earlier. Labels are normalized. */
export function countDecisionMetrics(lines: DecisionLine[]): {
  duplicateApprovals: number
  approvedAfterReject: number
} {
  const approved = new Set<string>()
  const rejected = new Set<string>()
  let duplicateApprovals = 0
  let approvedAfterReject = 0
  for (const line of lines) {
    for (const item of itemsOf(line)) {
      const key = normalizeKey(item.label)
      if (!key) continue
      const typeKey = `${item.type}|${key}`
      if (!item.approve) {
        rejected.add(typeKey)
        continue
      }
      if (approved.has(typeKey)) duplicateApprovals += 1
      if (rejected.has(typeKey)) approvedAfterReject += 1
      approved.add(typeKey)
    }
  }
  return { duplicateApprovals, approvedAfterReject }
}

/** The context for a pending interview answer or proposals batch. Reads only; writes nothing. */
export async function buildAuthorContext(
  db: Db,
  actor: Actor,
  workId: string,
  dir: string,
  p: Pending,
): Promise<AuthorContext> {
  const entryRows = await listEntries(db, actor, workId)
  const factRows = await listFacts(db, actor, workId)
  const threadRows = await listThreads(db, actor, workId)
  const relationRows = await listRelations(db, actor, workId)
  const lines = readDecisions(dir)
  return {
    pendingRef: {
      key: pendingKey(p),
      itemIds: p.kind === 'proposals' ? p.items.map((item) => item.id) : [],
    },
    wiki: summarizeWiki(entryRows, factRows, threadRows, relationRows),
    decisions: summarize(lines),
    hints: p.kind === 'proposals' ? proposalHints(p, entryRows, factRows, lines) : {},
  }
}

export function writeAuthorContext(dir: string, context: AuthorContext): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, CONTEXT_FILE), `${JSON.stringify(context, null, 2)}\n`)
}

export function removeAuthorContext(dir: string): void {
  rmSync(join(dir, CONTEXT_FILE), { force: true, recursive: true })
}
