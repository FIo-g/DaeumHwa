import { and, eq, inArray, type SQL } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, facts, proposals, threads, wikiEntries } from '@/db/schema'
import type {
  Actor,
  EntryRow,
  FactSourceType,
  FactStatus,
  ProposalRow,
  ProposalSource,
  ProposalStatus,
  ProposalType,
} from '@/db/types'
import { AppError, isAppError } from '@/lib/errors'
import { type ProposalPayloadMap, parseProposalPayload } from '@/lib/proposal-payloads'
import { requireRowWork, requireWorkRole } from '@/server/access'
import {
  assertChapterInWork,
  type ChangeOpts,
  createFact,
  findEntryByName,
  supersedeFact,
} from '@/server/facts'
import { createRelation } from '@/server/relations'
import { setChapterSummary } from '@/server/chapters'
import { createStyleCard } from '@/server/styles'
import { addThreadEvent, createThread } from '@/server/threads'
import { createEntry, type EntryInput, updateEntry } from '@/server/wiki'

// Approval engine for AI and import proposals (spec §4.2, F1/F5/F6/F7/F17).
// Approving a proposal is the only path, besides author-initiated services, that writes wiki
// rows. Each approval runs in one transaction: the proposal is claimed, the wiki change is
// applied through the normal services (so change_log rows are recorded), and the proposal is
// marked approved. A failed approval rolls everything back and the proposal stays pending.

/** Order used by bulk approval: a card exists before the facts, threads and relations that use it. */
export const APPLY_ORDER: ProposalType[] = [
  'entry_create',
  'entry_update',
  'fact_create',
  'thread_create',
  'thread_event',
  'relation_create',
  'chapter_summary',
  'style_card',
]

export type ProposalView = ProposalRow & {
  chapterPosition: number | null
  chapterTitle: string | null
  groupKey: string
  groupLabel: string
}

export type ListProposalsFilter = {
  status?: ProposalStatus
  chapterId?: string
  source?: ProposalSource
  sourceRef?: string
  limit?: number
}

export type ApproveProposalInput = {
  proposalId: string
  /** Top-level payload keys to replace before the payload is validated again. */
  payloadOverride?: Record<string, unknown>
  /** Tag for a fact proposal. Defaults to the suggested status. */
  factStatus?: FactStatus
  note?: string
}

export type BulkApproveInput = {
  workId: string
  /** Approve these proposals. Without ids, every pending proposal with `sourceRef` is approved. */
  proposalIds?: string[]
  sourceRef?: string
  /** Default true. When false and no defaultFactStatus is given, fact proposals become 'undecided'. */
  useSuggestedStatus?: boolean
  /** Overrides the suggested status of every fact proposal in the batch. */
  defaultFactStatus?: FactStatus
}

export type BulkApproveResult = {
  approved: number
  failed: { proposalId: string; message: string }[]
}

const NOT_FOUND_MESSAGE = '항목을 찾을 수 없습니다.'
const ALREADY_DECIDED_MESSAGE = '이미 처리된 제안입니다.'
const APPROVE_FAILED_MESSAGE = '승인하지 못했습니다.'

// ---- Grouping for the approval screen ----

function nameGroup(name: string): { groupKey: string; groupLabel: string } {
  const label = name.trim().replace(/\s+/g, ' ') || '이름 없음'
  return { groupKey: `name:${label}`, groupLabel: label }
}

function threadGroup(title: string): { groupKey: string; groupLabel: string } {
  const label = title.trim().replace(/\s+/g, ' ') || '제목 없는 떡밥'
  return { groupKey: `thread:${label}`, groupLabel: label }
}

/** Groups entity proposals by the card or thread they are about (the screen's "카드별 묶음"). */
function groupOf(type: ProposalType, payload: unknown): { groupKey: string; groupLabel: string } {
  switch (type) {
    case 'entry_create':
      return nameGroup((payload as ProposalPayloadMap['entry_create']).name)
    case 'entry_update':
      return nameGroup((payload as ProposalPayloadMap['entry_update']).entryName)
    case 'fact_create':
      return nameGroup((payload as ProposalPayloadMap['fact_create']).subjectName)
    case 'relation_create':
      return nameGroup((payload as ProposalPayloadMap['relation_create']).sourceName)
    case 'thread_create':
      return threadGroup((payload as ProposalPayloadMap['thread_create']).title)
    case 'thread_event':
      return threadGroup((payload as ProposalPayloadMap['thread_event']).threadTitle)
    case 'chapter_summary':
      return { groupKey: 'summary', groupLabel: '회차 요약' }
    case 'style_card':
      return { groupKey: 'style', groupLabel: '문체 카드' }
  }
}

/** Reads proposals with their chapter position and group. Callers check access first. */
async function selectViews(db: Db, conditions: SQL[]): Promise<ProposalView[]> {
  const rows = await db
    .select({
      proposal: proposals,
      chapterPosition: chapters.position,
      chapterTitle: chapters.title,
    })
    .from(proposals)
    .leftJoin(chapters, eq(chapters.id, proposals.chapterId))
    .where(and(...conditions))
  return rows.map(({ proposal, chapterPosition, chapterTitle }) => ({
    ...proposal,
    chapterPosition: chapterPosition ?? null,
    chapterTitle: chapterTitle ?? null,
    ...groupOf(proposal.type, proposal.payload),
  }))
}

/** Dependency order first, then chapter position, then the order they were created. */
function sortViews(views: ProposalView[]): ProposalView[] {
  const rank = (type: ProposalType) => APPLY_ORDER.indexOf(type)
  const pos = (v: ProposalView) => v.chapterPosition ?? Number.MAX_SAFE_INTEGER
  return [...views].sort(
    (a, b) =>
      rank(a.type) - rank(b.type) ||
      pos(a) - pos(b) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

/** Proposals of a work, newest decisions aside: pending by default, in apply order. Viewer role. */
export async function listProposals(
  db: Db,
  actor: Actor,
  workId: string,
  o: ListProposalsFilter = {},
): Promise<ProposalView[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions: SQL[] = [
    eq(proposals.workId, workId),
    eq(proposals.status, o.status ?? 'pending'),
  ]
  if (o.chapterId) conditions.push(eq(proposals.chapterId, o.chapterId))
  if (o.source) conditions.push(eq(proposals.source, o.source))
  if (o.sourceRef !== undefined) conditions.push(eq(proposals.sourceRef, o.sourceRef))
  const views = sortViews(await selectViews(db, conditions))
  return o.limit !== undefined ? views.slice(0, o.limit) : views
}

// ---- Lookups scoped to the proposal's work ----

function missingCard(name: string): AppError {
  return new AppError(
    'BAD_STATE',
    `관계에 필요한 카드(${name})가 위키에 없습니다. 카드 제안을 먼저 승인하세요.`,
  )
}

async function chapterPosition(db: Db, workId: string, chapterId: string): Promise<number> {
  const [row] = await db
    .select({ position: chapters.position })
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.workId, workId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  return row.position
}

async function chapterPositions(
  db: Db,
  workId: string,
  chapterIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(chapterIds)]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: chapters.id, position: chapters.position })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), inArray(chapters.id, unique)))
  return new Map(rows.map((r) => [r.id, r.position]))
}

async function requireEntryInWork(db: Db, workId: string, entryId: string): Promise<EntryRow> {
  const [row] = await db
    .select()
    .from(wikiEntries)
    .where(and(eq(wikiEntries.id, entryId), eq(wikiEntries.workId, workId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
  return row
}

async function requireFactInWork(db: Db, workId: string, factId: string): Promise<void> {
  const [row] = await db
    .select({ id: facts.id })
    .from(facts)
    .where(and(eq(facts.id, factId), eq(facts.workId, workId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
}

async function requireThreadInWork(db: Db, workId: string, threadId: string): Promise<void> {
  const [row] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.id, threadId), eq(threads.workId, workId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
}

/** Facts from interviews and imports keep their source; everything else is a chapter fact. */
function factSourceType(source: ProposalSource): FactSourceType {
  if (source === 'interview') return 'interview'
  if (source === 'import') return 'import'
  return 'chapter'
}

// ---- Apply ----

type ApplyResult = { targetId: string | null; notes: string[] }

/** Applies one validated payload through the wiki services. Runs inside the approval transaction. */
async function applyProposal(
  tx: Db,
  actor: Actor,
  proposal: ProposalRow,
  payload: unknown,
  factStatus: FactStatus | undefined,
): Promise<ApplyResult> {
  const workId = proposal.workId
  const o: ChangeOpts = { proposerType: 'ai', proposalId: proposal.id }

  switch (proposal.type) {
    case 'entry_create': {
      const p = payload as ProposalPayloadMap['entry_create']
      const existing = await findEntryByName(tx, workId, p.name)
      if (!existing) {
        const created = await createEntry(
          tx,
          actor,
          {
            workId,
            kind: p.kind,
            name: p.name,
            aliases: p.aliases,
            summary: p.summary,
            fields: p.fields,
          },
          o,
        )
        return { targetId: created.id, notes: [] }
      }
      // Same name already on the wiki: add new aliases and fill only the empty summary and fields.
      const patch: Partial<EntryInput> = {}
      const addedAliases = [...p.aliases, p.name]
        .map((a) => a.trim())
        .filter((a) => a && a !== existing.name && !existing.aliases.includes(a))
      if (addedAliases.length > 0) {
        patch.aliases = [...existing.aliases, ...new Set(addedAliases)]
      }
      if (!existing.summary.trim() && p.summary.trim()) patch.summary = p.summary
      const fields: Record<string, string> = { ...existing.fields }
      let fieldsChanged = false
      for (const [key, value] of Object.entries(p.fields)) {
        if (!fields[key]?.trim() && value.trim()) {
          fields[key] = value
          fieldsChanged = true
        }
      }
      if (fieldsChanged) patch.fields = fields
      if (Object.keys(patch).length > 0) await updateEntry(tx, actor, existing.id, patch, o)
      return { targetId: existing.id, notes: [] }
    }

    case 'entry_update': {
      const p = payload as ProposalPayloadMap['entry_update']
      const current = await requireEntryInWork(tx, workId, p.entryId)
      // Aliases are only added, never dropped: a removed alias would break name matching.
      const patch: Partial<EntryInput> = {}
      if (p.patch.summary !== undefined) patch.summary = p.patch.summary
      if (p.patch.aliases !== undefined) {
        const added = p.patch.aliases.filter((a) => !current.aliases.includes(a))
        if (added.length > 0) patch.aliases = [...current.aliases, ...added]
      }
      if (p.patch.fields !== undefined) patch.fields = { ...current.fields, ...p.patch.fields }
      if (Object.keys(patch).length > 0) await updateEntry(tx, actor, current.id, patch, o)
      return { targetId: current.id, notes: [] }
    }

    case 'fact_create': {
      const p = payload as ProposalPayloadMap['fact_create']
      const status: FactStatus = factStatus ?? p.suggestedStatus
      const sourceType = factSourceType(proposal.source)
      if (p.supersedesFactId && p.sourceChapterId) {
        await requireFactInWork(tx, workId, p.supersedesFactId)
        const fromPosition = await chapterPosition(tx, workId, p.sourceChapterId)
        const { newFact } = await supersedeFact(
          tx,
          actor,
          {
            factId: p.supersedesFactId,
            fromPosition,
            content: p.content,
            status,
            evidence: p.evidence,
            sourceChapterId: p.sourceChapterId,
            sourceType,
          },
          o,
        )
        return { targetId: newFact.id, notes: [] }
      }
      const fact = await createFact(
        tx,
        actor,
        {
          workId,
          entryId: p.entryId,
          subjectName: p.subjectName,
          content: p.content,
          status,
          sourceType,
          sourceChapterId: p.sourceChapterId,
          evidence: p.evidence,
        },
        o,
      )
      return { targetId: fact.id, notes: [] }
    }

    case 'thread_create': {
      const p = payload as ProposalPayloadMap['thread_create']
      // Interview ideas are not on the page yet, so they start as planned.
      const status = proposal.source === 'interview' ? 'planned' : p.status
      const relatedEntryIds: string[] = []
      for (const name of p.relatedNames) {
        const entry = await findEntryByName(tx, workId, name)
        if (entry && !relatedEntryIds.includes(entry.id)) relatedEntryIds.push(entry.id)
      }
      const thread = await createThread(
        tx,
        actor,
        {
          workId,
          title: p.title,
          description: p.description,
          status,
          plantedChapterId: status === 'planted' ? p.plantedChapterId : null,
          targetChapterPosition: p.targetChapterPosition,
          importance: p.importance,
          relatedEntryIds,
        },
        o,
      )
      const notes: string[] = []
      const positions = await chapterPositions(
        tx,
        workId,
        p.events.map((e) => e.chapterId),
      )
      const ordered = p.events
        .map((event) => ({ event, position: positions.get(event.chapterId) }))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      for (const { event, position } of ordered) {
        if (position === undefined) {
          notes.push(`떡밥 '${p.title}' 기록을 건너뛰었습니다: 회차를 찾을 수 없습니다.`)
          continue
        }
        try {
          await addThreadEvent(
            tx,
            actor,
            {
              threadId: thread.id,
              kind: event.kind,
              chapterId: event.chapterId,
              evidence: event.evidence,
            },
            o,
          )
        } catch (e) {
          if (!isAppError(e)) throw e
          notes.push(`떡밥 '${p.title}' 기록을 건너뛰었습니다: ${e.message}`)
        }
      }
      return { targetId: thread.id, notes }
    }

    case 'thread_event': {
      const p = payload as ProposalPayloadMap['thread_event']
      await requireThreadInWork(tx, workId, p.threadId)
      const event = await addThreadEvent(
        tx,
        actor,
        {
          threadId: p.threadId,
          kind: p.kind,
          chapterId: p.chapterId,
          note: p.note,
          evidence: p.evidence,
        },
        o,
      )
      return { targetId: event.id, notes: [] }
    }

    case 'relation_create': {
      const p = payload as ProposalPayloadMap['relation_create']
      const source = await findEntryByName(tx, workId, p.sourceName)
      if (!source) throw missingCard(p.sourceName)
      const target = await findEntryByName(tx, workId, p.targetName)
      if (!target) throw missingCard(p.targetName)
      const startPosition =
        p.startPosition ??
        (proposal.chapterId ? await chapterPosition(tx, workId, proposal.chapterId) : null)
      const relation = await createRelation(
        tx,
        actor,
        {
          workId,
          sourceEntryId: source.id,
          targetEntryId: target.id,
          kind: p.kind,
          description: p.description,
          directed: p.directed,
          startPosition,
          endPosition: null,
        },
        o,
      )
      return { targetId: relation.id, notes: [] }
    }

    case 'chapter_summary': {
      const p = payload as ProposalPayloadMap['chapter_summary']
      await assertChapterInWork(tx, workId, p.chapterId)
      await setChapterSummary(tx, actor, {
        chapterId: p.chapterId,
        summary: p.summary,
        proposerType: 'ai',
        proposalId: proposal.id,
      })
      return { targetId: p.chapterId, notes: [] }
    }

    case 'style_card': {
      const p = payload as ProposalPayloadMap['style_card']
      const entry = p.entryName ? await findEntryByName(tx, workId, p.entryName) : null
      const card = await createStyleCard(
        tx,
        actor,
        {
          workId,
          entryId: entry?.id ?? null,
          name: p.name,
          tone: p.tone,
          rules: p.rules,
          examples: p.examples,
        },
        o,
      )
      return { targetId: card.id, notes: [] }
    }
  }
}

// ---- Approve / reject ----

/**
 * Approves one pending proposal: applies its payload (after merging and re-validating any edits)
 * and marks it approved, in one transaction. Editor role.
 */
export async function approveProposal(
  db: Db,
  actor: Actor,
  input: ApproveProposalInput,
): Promise<{ proposal: ProposalRow; targetId: string | null }> {
  const workId = await requireRowWork(db, 'proposals', input.proposalId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [current] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, input.proposalId))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', NOT_FOUND_MESSAGE)
  if (current.status !== 'pending') throw new AppError('BAD_STATE', ALREADY_DECIDED_MESSAGE)

  const merged = input.payloadOverride
    ? { ...(current.payload as Record<string, unknown>), ...input.payloadOverride }
    : current.payload
  // Validated before any write, so an invalid edit leaves the proposal pending.
  const payload = parseProposalPayload(current.type, merged)

  return db.transaction(async (tx) => {
    // Claim the row first: a concurrent approval of the same proposal fails here instead of
    // applying the change twice.
    const [claimed] = await tx
      .update(proposals)
      .set({ status: 'approved', decidedBy: actor.userId, decidedAt: new Date() })
      .where(and(eq(proposals.id, current.id), eq(proposals.status, 'pending')))
      .returning()
    if (!claimed) throw new AppError('BAD_STATE', ALREADY_DECIDED_MESSAGE)

    const applied = await applyProposal(tx, actor, claimed, payload, input.factStatus)
    const notes = [input.note?.trim() ?? '', ...applied.notes].filter((n) => n.length > 0)
    const [done] = await tx
      .update(proposals)
      .set({ appliedTargetId: applied.targetId, decisionNote: notes.join('\n') })
      .where(eq(proposals.id, current.id))
      .returning()
    return { proposal: done, targetId: applied.targetId }
  })
}

/** Rejects a pending proposal. The wiki is not touched. Editor role. */
export async function rejectProposal(
  db: Db,
  actor: Actor,
  input: { proposalId: string; note?: string },
): Promise<ProposalRow> {
  const workId = await requireRowWork(db, 'proposals', input.proposalId)
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const [row] = await db
    .update(proposals)
    .set({
      status: 'rejected',
      decidedBy: actor.userId,
      decidedAt: new Date(),
      decisionNote: (input.note ?? '').trim(),
    })
    .where(and(eq(proposals.id, input.proposalId), eq(proposals.status, 'pending')))
    .returning()
  if (!row) throw new AppError('BAD_STATE', ALREADY_DECIDED_MESSAGE)
  return row
}

function resolveFactStatus(type: ProposalType, input: BulkApproveInput): FactStatus | undefined {
  if (type !== 'fact_create') return undefined
  if (input.defaultFactStatus) return input.defaultFactStatus
  if (input.useSuggestedStatus === false) return 'undecided'
  return undefined
}

/**
 * Approves many proposals in APPLY_ORDER. Each proposal has its own transaction, so one failure
 * is reported and the rest still go through. Editor role.
 */
export async function bulkApprove(
  db: Db,
  actor: Actor,
  input: BulkApproveInput,
): Promise<BulkApproveResult> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  if (!input.proposalIds && input.sourceRef === undefined) {
    throw new AppError('VALIDATION', '승인할 제안을 고르세요.')
  }
  const ids = input.proposalIds ? [...new Set(input.proposalIds)] : null
  if (ids && ids.length === 0) return { approved: 0, failed: [] }

  const conditions: SQL[] = [eq(proposals.workId, input.workId)]
  if (ids) conditions.push(inArray(proposals.id, ids))
  else conditions.push(eq(proposals.status, 'pending'))
  if (input.sourceRef !== undefined) conditions.push(eq(proposals.sourceRef, input.sourceRef))
  const rows = sortViews(await selectViews(db, conditions))

  const failed: BulkApproveResult['failed'] = []
  if (ids) {
    const found = new Set(rows.map((r) => r.id))
    for (const id of ids) {
      if (!found.has(id)) failed.push({ proposalId: id, message: NOT_FOUND_MESSAGE })
    }
  }

  let approved = 0
  for (const row of rows) {
    if (row.status !== 'pending') {
      failed.push({ proposalId: row.id, message: ALREADY_DECIDED_MESSAGE })
      continue
    }
    try {
      await approveProposal(db, actor, {
        proposalId: row.id,
        factStatus: resolveFactStatus(row.type, input),
      })
      approved += 1
    } catch (e) {
      failed.push({
        proposalId: row.id,
        message: isAppError(e) ? e.message : APPROVE_FAILED_MESSAGE,
      })
    }
  }
  return { approved, failed }
}
