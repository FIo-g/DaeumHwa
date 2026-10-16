import { z } from 'zod'
import { ENTRY_KINDS, FACT_STATUSES, type EntryKind, type ProposalSource } from '@/db/types'
import { stripJosa } from '@/lib/korean'
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
  /** Model-facing ref (e.g. "T1") to an existing thread. */
  threadRefs: Map<string, { id: string; title: string }>
  /** Model-facing ref (e.g. "F1") to an existing fact. */
  factRefs: Map<string, { id: string }>
  /** Titles of threads created by a pending proposal that may still receive events. */
  pendingThreadTitles?: Set<string>
}

/** A thread event whose target is a pending (not yet approved) thread_create. T16 attaches these. */
export type PendingThreadEvent = {
  title: string
  kind: 'developed' | 'resolved'
  evidence: string
}

type ExistingEntry = ExtractionContext['existingEntries'][number]

/** Comparison key for names: trimmed, with trailing particles stripped (서윤이 -> 서윤). */
function nameKey(s: string): string {
  return stripJosa(s.trim())
}

/** Collapses internal whitespace and trims, for content comparison. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function lookupRef<V>(map: Map<string, V>, ref: string | null): V | undefined {
  if (ref === null) return undefined
  return map.get(ref.trim())
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

  // Existing entries, indexed by normalized name and alias.
  const existingByKey = new Map<string, ExistingEntry>()
  for (const e of ctx.existingEntries) {
    for (const n of [e.name, ...e.aliases]) {
      const key = nameKey(n)
      if (key && !existingByKey.has(key)) existingByKey.set(key, e)
    }
  }
  const findExisting = (name: string): ExistingEntry | undefined => {
    const key = nameKey(name)
    return key ? existingByKey.get(key) : undefined
  }

  // Entries: existing names are skipped; new ones become entry_create (deduped by name).
  const seenEntries = new Set<string>()
  for (const e of x.entries) {
    const name = e.name.trim()
    if (!name) continue
    const key = nameKey(name)
    if (seenEntries.has(key) || findExisting(name)) continue
    seenEntries.add(key)

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
    const key = `${nameKey(subjectName)}|${content}`
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

  // Threads: planted -> thread_create; developed/resolved -> thread_event, or pending when the
  // target is a not-yet-approved thread; anything else is dropped.
  const seenCreates = new Set<string>()
  const seenEvents = new Set<string>()
  for (const t of x.threads) {
    const title = t.title.trim()
    if (!title) continue
    const description = t.description.trim()
    const evidence = t.evidence.trim()

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

    const ref = lookupRef(ctx.threadRefs, t.existingThreadRef)
    if (ref) {
      const key = `${ref.id}|${t.kind}`
      if (seenEvents.has(key)) continue
      seenEvents.add(key)
      proposals.push(
        makeProposal(ctx, 'thread_event', {
          threadId: ref.id,
          threadTitle: ref.title,
          kind: t.kind,
          chapterId: ctx.chapterId,
          note: description,
          evidence,
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
    const kind = r.kind.trim()
    const key = `${nameKey(sourceName)}|${nameKey(targetName)}|${kind}`
    if (seenRelations.has(key)) continue
    seenRelations.add(key)
    proposals.push(
      makeProposal(ctx, 'relation_create', {
        sourceName,
        targetName,
        kind,
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
