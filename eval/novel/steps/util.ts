import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { approveProposal, rejectProposal, type ProposalView } from '@/server/proposals'
import type { CallRecord } from '../eval-client'
import {
  type Answer,
  type Pending,
  clearPending,
  logDecision,
  readAnswer,
  readPending,
  writePending,
} from '../author-io'
import type { RunContext } from '../run'
import { type DraftAttempt, type RunState, saveState } from '../state'

// Shared helpers for the step machine: persistence and idempotency marks, the author handshake
// (pending.json / answer.json), proposal decisions, and small text utilities.

export type ModelFailure = NonNullable<CallRecord['error']>

/** Carries an external (limit or network) failure out of a step so the runner can pause on it. */
export class ExternalFailureError extends Error {
  readonly failure: ModelFailure

  constructor(failure: ModelFailure) {
    super(failure.message)
    this.name = 'ExternalFailureError'
    this.failure = failure
  }
}

/** Saves state with the current call counter. Every side effect is followed by a save. */
export function persist(ctx: RunContext, state: RunState): void {
  state.nextSeq = ctx.client.nextSeq
  state.updatedAt = new Date().toISOString()
  saveState(ctx.dir, state)
}

export function isMarked(state: RunState, key: string): boolean {
  return state.data.marks[key] === true
}

/**
 * Sets an idempotency mark and saves. The test hook `throwAfter` throws once, after the mark is
 * already on disk, so a rerun must not repeat the work the mark covers.
 */
export function mark(ctx: RunContext, state: RunState, key: string): void {
  state.data.marks[key] = true
  persist(ctx, state)
  if (ctx.throwAfter === key) {
    ctx.throwAfter = undefined
    throw new Error(`test hook: throwAfter ${key}`)
  }
}

/** Runs `fn`, retrying once on a model failure. External failures propagate to the runner. */
export async function withModelRetry<T>(
  ctx: RunContext,
  state: RunState,
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const failure = ctx.client.takeLastFailure()
      if (failure && failure.kind !== 'model') throw new ExternalFailureError(failure)
      // No AI failure recorded: a service or harness bug, not a model answer.
      if (!failure) throw error
      if (attempt === 1) {
        state.retried[label] = (state.retried[label] ?? 0) + 1
        persist(ctx, state)
        continue
      }
      state.failed.push({ step: label, message: failure.message })
      persist(ctx, state)
      return null
    }
  }
}

export function requireWorkId(state: RunState): string {
  const workId = state.data.workId
  if (!workId) throw new Error('setup has not created the work yet')
  return workId
}

/** The chapter number in a key such as 'ch3:draft'. */
export function chapterOf(key: string): number {
  const match = /^ch(\d+):/.exec(key)
  if (!match) throw new Error(`not a chapter step: ${key}`)
  return Number(match[1])
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function writeRunFile(dir: string, rel: string, text: string): void {
  const file = path.join(dir, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

export function readRunFile(dir: string, rel: string): string {
  return readFileSync(path.join(dir, rel), 'utf8')
}

export function readCallRecords(dir: string): CallRecord[] {
  const callsDir = path.join(dir, 'calls')
  if (!existsSync(callsDir)) return []
  return readdirSync(callsDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(callsDir, name), 'utf8')) as CallRecord)
}

// ---- Author handshake ----

/** Identity of a pending item: the same key means the same question is still waiting. */
export function pendingKey(p: Pending): string {
  const id = p.kind === 'interview_answer' ? p.turnId : p.kind === 'draft_review' ? p.attempt : ''
  return [p.step, p.kind, String(id)].join('|')
}

/** The pending item this step wrote earlier, if it is still waiting. */
export function pendingFor<K extends Pending['kind']>(
  dir: string,
  step: string,
  kind: K,
): Extract<Pending, { kind: K }> | null {
  const current = readPending(dir)
  if (!current || current.step !== step || current.kind !== kind) return null
  return current as Extract<Pending, { kind: K }>
}

/**
 * Writes the pending item unless the same one is already waiting (rewriting would delete an
 * answer that is already there), then returns the author's answer or null while waiting.
 */
export function consult(ctx: RunContext, p: Pending): Answer | null {
  const current = readPending(ctx.dir)
  if (!current || pendingKey(current) !== pendingKey(p)) writePending(ctx.dir, p)
  return readAnswer(ctx.dir, p)
}

/** Logs the answer and clears the pending item. Call only after the answer's effects are saved. */
export function settle(ctx: RunContext, p: Pending, answer: Answer): void {
  logDecision(ctx.dir, p, answer)
  clearPending(ctx.dir)
}

/** Approves or rejects each proposal once. A decision already marked is skipped on a rerun. */
export async function applyProposalDecisions(
  ctx: RunContext,
  state: RunState,
  decisions: { id: string; approve: boolean; reason: string }[],
): Promise<void> {
  for (const decision of decisions) {
    const key = `decided:${decision.id}`
    if (isMarked(state, key)) continue
    if (decision.approve) {
      await approveProposal(ctx.db, ctx.actor, { proposalId: decision.id, note: decision.reason })
    } else {
      await rejectProposal(ctx.db, ctx.actor, { proposalId: decision.id, note: decision.reason })
    }
    mark(ctx, state, key)
  }
}

export function toProposalItems(views: ProposalView[]) {
  return views.map((view) => ({
    id: view.id,
    type: view.type,
    payload: view.payload as Record<string, unknown>,
  }))
}

// ---- Text utilities ----

/** Entries whose name or an alias appears in the draft instructions (case-insensitive). */
export function selectDraftEntries(
  entries: { id: string; name: string; aliases: string[] }[],
  instructions: string,
): string[] {
  const haystack = instructions.toLowerCase()
  const picked = new Set<string>()
  for (const entry of entries) {
    const terms = [entry.name, ...entry.aliases]
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 0)
    if (terms.some((term) => haystack.includes(term))) picked.add(entry.id)
  }
  return [...picked]
}

/**
 * Applies accepted suggestions to the text. A suggestion whose span does not hold its quote is
 * skipped. When two overlap, the one that starts first wins.
 */
export function applySuggestions(
  text: string,
  accepted: { quote: string; replacement: string; start: number; end: number }[],
): string {
  const valid = accepted.filter(
    (s) =>
      s.quote.length > 0 &&
      s.start >= 0 &&
      s.end <= text.length &&
      text.slice(s.start, s.end) === s.quote,
  )
  const kept: typeof valid = []
  let edge = -1
  for (const s of [...valid].sort((a, b) => a.start - b.start)) {
    if (s.start < edge) continue
    kept.push(s)
    edge = s.end
  }
  let out = text
  for (const s of [...kept].reverse()) {
    out = out.slice(0, s.start) + s.replacement + out.slice(s.end)
  }
  return out
}

/** The first usable attempt, else the highest quality (the latest on ties). */
export function pickAttempt(attempts: DraftAttempt[]): DraftAttempt {
  const usable = attempts.find((attempt) => attempt.usable === true)
  if (usable) return usable
  return attempts.reduce((best, attempt) =>
    (attempt.quality ?? 0) >= (best.quality ?? 0) ? attempt : best,
  )
}
