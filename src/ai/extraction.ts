import { z } from 'zod'
import {
  ENTRY_KINDS,
  FACT_STATUSES,
  type EntryKind,
  type ProposalSource,
  type ThreadStatus,
} from '@/db/types'
import { hasJongseong, JOSA } from '@/lib/korean'
import type { NewProposal, ProposalPayloadMap } from '@/lib/proposal-payloads'

// Structured-output schema shared by interview extraction (T12), chapter extraction (T13) and
// import extraction (T16). Structured-output rules: no min/max/regex/default/optional; maps are
// arrays of {key, value}. Pure module: no DB, no AI calls.

export const ExtractionSchema = z.object({
  summary: z.string().nullable(),
  entries: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(ENTRY_KINDS),
      aliases: z.array(z.string()),
      summary: z.string(),
      fields: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
  facts: z.array(
    z.object({
      subjectName: z.string(),
      content: z.string(),
      evidence: z.string(),
      suggestedStatus: z.enum(FACT_STATUSES),
      supersedesFactRef: z.string().nullable(),
    }),
  ),
  threads: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      kind: z.enum(['planted', 'developed', 'resolved']),
      evidence: z.string(),
      existingThreadRef: z.string().nullable(),
      targetChapterPosition: z.number().int().nullable(),
    }),
  ),
  relations: z.array(
    z.object({
      sourceName: z.string(),
      targetName: z.string(),
      kind: z.string(),
      description: z.string(),
      evidence: z.string(),
    }),
  ),
})

export type Extraction = z.infer<typeof ExtractionSchema>

export type ExtractionContext = {
  source: ProposalSource
  sourceRef: string | null
  chapterId: string | null
  chapterPosition: number | null
  existingEntries: { id: string; name: string; aliases: string[]; kind: EntryKind }[]
  /** Model-facing ref (e.g. "T1") to an existing thread. `status` is set for threads on the wiki. */
  threadRefs: Map<string, { id: string; title: string; status?: ThreadStatus }>
  /** Model-facing ref (e.g. "F1") to an existing fact. */
  factRefs: Map<string, { id: string }>
  /** Titles of threads created by a pending proposal that may still receive events. */
  pendingThreadTitles?: Set<string>
  /** Every non-archived thread of the work. A planted thread that matches one of them by title is not created again. */
  existingThreads?: { id: string; title: string; status: ThreadStatus }[]
  /** Active relations of the work. A relation that is still open is not proposed again. */
  existingRelations?: {
    sourceId: string
    targetId: string
    kind: string
    directed: boolean
    endPosition: number | null
  }[]
}

/** A thread event whose target is a pending (not yet approved) thread_create. T16 attaches these. */
export type PendingThreadEvent = {
  title: string
  kind: 'developed' | 'resolved'
  evidence: string
}

type ExistingEntry = ExtractionContext['existingEntries'][number]
type ThreadTarget = { id: string; title: string; status?: ThreadStatus }

/** The word with one trailing particle removed, for each particle that fits the word. */
function oneParticleStripped(word: string): string[] {
  const forms: string[] = []
  for (const token of JOSA) {
    if (!word.endsWith(token) || word.length - token.length < 2) continue
    if (token === '이' && !hasJongseong(word.charAt(word.length - token.length - 1))) continue
    forms.push(word.slice(0, word.length - token.length))
  }
  return forms
}

/**
 * Lookup keys for a name from the model, in order: the trimmed name, then the name with up to
 * two trailing particles removed (김서아가 -> 김서아 -> 김서). Only the incoming name is stripped;
 * wiki names are never stripped, so 김서은 does not match 김서아.
 */
function nameCandidates(s: string): string[] {
  const trimmed = s.trim()
  if (!trimmed) return []
  const forms = [trimmed]
  let frontier = [trimmed]
  for (let step = 0; step < 2; step++) {
    const next: string[] = []
    for (const word of frontier) {
      for (const form of oneParticleStripped(word)) {
        if (forms.includes(form)) continue
        forms.push(form)
        next.push(form)
      }
    }
    frontier = next
  }
  return forms
}

/** Collapses internal whitespace and trims, for content comparison. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function lookupRef<V>(map: Map<string, V>, ref: string | null): V | undefined {
  if (ref === null) return undefined
  return map.get(ref.trim())
}

/** True when an existing relation already links the two entries with the same kind and is still open. */
function coversRelation(
  rel: NonNullable<ExtractionContext['existingRelations']>[number],
  sourceId: string,
  targetId: string,
  kind: string,
  chapterPosition: number | null,
): boolean {
  if (collapse(rel.kind) !== kind) return false
  const forward = rel.sourceId === sourceId && rel.targetId === targetId
  // New relations are undirected, so an undirected existing one also matches the reversed pair.
  const backward = !rel.directed && rel.sourceId === targetId && rel.targetId === sourceId
  if (!forward && !backward) return false
  // A relation that ended before this chapter does not block a new one.
  return rel.endPosition === null || chapterPosition === null || rel.endPosition >= chapterPosition
}

function makeProposal<K extends NewProposal['type']>(
  ctx: ExtractionContext,
  type: K,
  payload: ProposalPayloadMap[K],
): NewProposal {
  return {
    type,
    payload,
    source: ctx.source,
    sourceRef: ctx.sourceRef,
    chapterId: ctx.chapterId,
  } as NewProposal
}

/**
 * Maps an extraction to proposals (spec §4.2). Never touches wiki tables; the caller inserts the
 * proposals through `insertProposals`. Rules are in the T12a plan section.
 */
export function extractionToProposals(
  x: Extraction,
  ctx: ExtractionContext,
): { proposals: NewProposal[]; pendingThreadEvents: PendingThreadEvent[] } {
  const proposals: NewProposal[] = []
  const pendingThreadEvents: PendingThreadEvent[] = []

  // Existing entries, by exact name or alias (first one wins).
  const existingByName = new Map<string, ExistingEntry>()
  for (const e of ctx.existingEntries) {
    for (const n of [e.name, ...e.aliases]) {
      const key = n.trim()
      if (key && !existingByName.has(key)) existingByName.set(key, e)
    }
  }
  // Exact match first; the particle-stripped form of the incoming name is tried second.
  const findExisting = (name: string): ExistingEntry | undefined => {
    for (const key of nameCandidates(name)) {
      const hit = existingByName.get(key)
      if (hit) return hit
    }
    return undefined
  }

  // Entries: existing names are skipped; new ones become entry_create (deduped by name).
  const newNames = new Set<string>()
  const newNameOf = (name: string): string | undefined =>
    nameCandidates(name).find((key) => newNames.has(key))
  // Identity of a name for dedupe: the wiki entry when one matches, else the new entry's name.
  const identityOf = (name: string): string => {
    const existing = findExisting(name)
    if (existing) return existing.id
    return `new:${newNameOf(name) ?? nameCandidates(name)[0] ?? ''}`
  }

  for (const e of x.entries) {
    const name = e.name.trim()
    if (!name) continue
    if (findExisting(name) || newNameOf(name)) continue
    newNames.add(name)

    const aliases: string[] = []
    for (const raw of e.aliases) {
      const alias = raw.trim()
      if (alias && alias !== name && !aliases.includes(alias)) aliases.push(alias)
    }
    const fieldMap = new Map<string, string>()
    for (const f of e.fields) {
      const k = f.key.trim()
      if (k && !fieldMap.has(k)) fieldMap.set(k, f.value.trim())
    }
    proposals.push(
      makeProposal(ctx, 'entry_create', {
        kind: e.kind,
        name,
        aliases,
        summary: e.summary.trim(),
        fields: Object.fromEntries(fieldMap),
      }),
    )
  }

  // Facts: subject binds to an existing entry when one matches (new entries stay null).
  const seenFacts = new Set<string>()
  for (const f of x.facts) {
    const content = collapse(f.content)
    if (!content) continue
    const subjectName = f.subjectName.trim()
    const key = `${identityOf(subjectName)}|${content}`
    if (seenFacts.has(key)) continue
    seenFacts.add(key)

    proposals.push(
      makeProposal(ctx, 'fact_create', {
        subjectName,
        entryId: findExisting(subjectName)?.id ?? null,
        content,
        suggestedStatus: f.suggestedStatus,
        sourceChapterId: ctx.chapterId,
        evidence: f.evidence.trim(),
        supersedesFactId: lookupRef(ctx.factRefs, f.supersedesFactRef)?.id ?? null,
      }),
    )
  }

  // Threads. A target is an existing thread: by the model's ref, or for a planted thread by
  // title. Planted into an interview-planned thread -> one planted event. Other planted threads
  // -> thread_create, unless the wiki already has them. developed/resolved -> thread_event, or
  // pending when the target is a not-yet-approved thread; anything else is dropped.
  const threadTargetOf = (
    ref: string | null,
    title: string,
    kind: 'planted' | 'developed' | 'resolved',
  ): ThreadTarget | undefined => {
    const byRef = lookupRef(ctx.threadRefs, ref)
    if (byRef) {
      return {
        ...byRef,
        status: byRef.status ?? ctx.existingThreads?.find((th) => th.id === byRef.id)?.status,
      }
    }
    if (kind !== 'planted') return undefined
    return ctx.existingThreads?.find((th) => collapse(th.title) === collapse(title))
  }

  const seenCreates = new Set<string>()
  const seenEvents = new Set<string>()
  for (const t of x.threads) {
    const title = t.title.trim()
    if (!title) continue
    const description = t.description.trim()
    const evidence = t.evidence.trim()

    const target = threadTargetOf(t.existingThreadRef, title, t.kind)
    if (target) {
      if (target.status === 'planned' && ctx.source !== 'interview' && ctx.chapterId) {
        // A chapter plants a thread that an interview already planned: record the planting.
        const key = `${target.id}|planted`
        if (!seenEvents.has(key)) {
          seenEvents.add(key)
          proposals.push(
            makeProposal(ctx, 'thread_event', {
              threadId: target.id,
              threadTitle: target.title,
              kind: 'planted',
              chapterId: ctx.chapterId,
              note: description,
              evidence,
            }),
          )
        }
        continue
      }
      // A planted thread that is already on the wiki (or planned by an interview) is not new.
      if (t.kind === 'planted') continue
      const key = `${target.id}|${t.kind}`
      if (seenEvents.has(key)) continue
      seenEvents.add(key)
      proposals.push(
        makeProposal(ctx, 'thread_event', {
          threadId: target.id,
          threadTitle: target.title,
          kind: t.kind,
          chapterId: ctx.chapterId,
          note: description,
          evidence,
        }),
      )
      continue
    }

    if (t.kind === 'planted') {
      const key = collapse(title)
      if (seenCreates.has(key)) continue
      seenCreates.add(key)
      proposals.push(
        makeProposal(ctx, 'thread_create', {
          title,
          description,
          status: ctx.source === 'interview' ? 'planned' : 'planted',
          plantedChapterId: ctx.chapterId,
          targetChapterPosition: t.targetChapterPosition,
          importance: 'medium',
          relatedNames: [],
          evidence,
          events: [],
        }),
      )
      continue
    }

    if (ctx.pendingThreadTitles?.has(title)) {
      const key = `pending|${title}|${t.kind}`
      if (seenEvents.has(key)) continue
      seenEvents.add(key)
      pendingThreadEvents.push({ title, kind: t.kind, evidence })
    }
  }

  // Relations: undirected, starting at the chapter position.
  const seenRelations = new Set<string>()
  for (const r of x.relations) {
    const sourceName = r.sourceName.trim()
    const targetName = r.targetName.trim()
    if (!sourceName || !targetName) continue
    const kind = collapse(r.kind)
    const sourceId = identityOf(sourceName)
    const targetId = identityOf(targetName)
    const sourceEntry = findExisting(sourceName)
    const targetEntry = findExisting(targetName)
    if (
      sourceEntry &&
      targetEntry &&
      ctx.existingRelations?.some((rel) =>
        coversRelation(rel, sourceEntry.id, targetEntry.id, kind, ctx.chapterPosition),
      )
    ) {
      continue
    }
    const key = `${sourceId}|${targetId}|${kind}`
    if (seenRelations.has(key)) continue
    seenRelations.add(key)
    proposals.push(
      makeProposal(ctx, 'relation_create', {
        sourceName,
        targetName,
        kind: r.kind.trim(),
        description: r.description.trim(),
        directed: false,
        startPosition: ctx.chapterPosition,
        evidence: r.evidence.trim(),
      }),
    )
  }

  // Chapter summary: only when the source is a chapter.
  const summary = x.summary?.trim()
  if (summary && ctx.chapterId) {
    proposals.push(makeProposal(ctx, 'chapter_summary', { chapterId: ctx.chapterId, summary }))
  }

  return { proposals, pendingThreadEvents }
}
