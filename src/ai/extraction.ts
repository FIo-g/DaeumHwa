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
import { ROLE_WORDS } from '@/ai/extraction-rules'

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
  /** Pending entry_create proposals. A name or alias that matches one is not created again. */
  pendingEntries?: { name: string; aliases: string[]; kind?: EntryKind }[]
  /** Titles of pending thread_create proposals. A planted thread with one of these titles is not created again. */
  pendingThreadCreateTitles?: Set<string>
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

const ROLE_SET: ReadonlySet<string> = new Set(ROLE_WORDS)

/** True for a role word or pronoun (주인공, 주인공은). Such a word is never a name. */
function isRoleName(name: string): boolean {
  return nameCandidates(name).some((form) => ROLE_SET.has(form))
}

/**
 * Names and aliases of cards, looked up by a name from the model. Exact and particle-stripped
 * forms match any card. The last word of a spaced name matches character cards only, and only
 * when the incoming kind is character or unknown ("북쪽 시계탑" never joins a place "시계탑").
 */
class NameIndex<T> {
  private readonly all = new Map<string, T>()
  private readonly characters = new Map<string, T>()

  /** The first item registered under a name wins. `kind` is the kind of the item's card. */
  add(names: string[], item: T, kind: EntryKind | undefined): void {
    for (const raw of names) {
      const key = raw.trim()
      if (!key) continue
      if (!this.all.has(key)) this.all.set(key, item)
      if (kind === 'character' && !this.characters.has(key)) this.characters.set(key, item)
    }
  }

  find(name: string, kind: EntryKind | undefined): T | undefined {
    for (const form of nameCandidates(name)) {
      const hit = this.all.get(form)
      if (hit) return hit
    }
    const words = name.trim().split(/\s+/)
    if (words.length < 2 || (kind !== undefined && kind !== 'character')) return undefined
    for (const form of nameCandidates(words[words.length - 1])) {
      const hit = this.characters.get(form)
      if (hit) return hit
    }
    return undefined
  }
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

  // Cards a name can refer to, searched in this order: wiki cards, pending entry_create
  // proposals, then names created earlier in this extraction.
  const wiki = new NameIndex<ExistingEntry>()
  for (const e of ctx.existingEntries) wiki.add([e.name, ...e.aliases], e, e.kind)
  const pending = new NameIndex<string>()
  for (const p of ctx.pendingEntries ?? []) pending.add([p.name, ...p.aliases], p.name, p.kind)
  const created = new NameIndex<string>()

  type Hit =
    { source: 'wiki'; entry: ExistingEntry } | { source: 'pending' | 'created'; name: string }
  const locate = (name: string, kind: EntryKind | undefined): Hit | undefined => {
    const entry = wiki.find(name, kind)
    if (entry) return { source: 'wiki', entry }
    const pendingName = pending.find(name, kind)
    if (pendingName !== undefined) return { source: 'pending', name: pendingName }
    const createdName = created.find(name, kind)
    if (createdName !== undefined) return { source: 'created', name: createdName }
    return undefined
  }
  // Identity of a name for dedupe: the card it matches, else the name itself.
  const identityOf = (name: string, hit: Hit | undefined): string => {
    if (!hit) return `name:${name}`
    return hit.source === 'wiki' ? `wiki:${hit.entry.id}` : `${hit.source}:${hit.name}`
  }
  // Kind of an extracted entry with this name, when the extraction has one.
  const kindOfEntry = (name: string): EntryKind | undefined => {
    for (const form of nameCandidates(name)) {
      const hit = x.entries.find((e) => e.name.trim() === form)
      if (hit) return hit.kind
    }
    return undefined
  }

  // Entries: a name that matches a card is skipped; an alias that matches a wiki card adds the
  // new name to that card; anything else becomes entry_create (deduped by name).
  for (const e of x.entries) {
    const name = e.name.trim()
    if (!name || isRoleName(name)) continue

    const aliases: string[] = []
    for (const raw of e.aliases) {
      const alias = raw.trim()
      if (alias && alias !== name && !aliases.includes(alias)) aliases.push(alias)
    }

    if (locate(name, e.kind)) continue

    const aliasHit = aliases.map((alias) => locate(alias, e.kind)).find((hit) => hit !== undefined)
    if (aliasHit) {
      if (aliasHit.source === 'wiki') {
        const { entry } = aliasHit
        const added = [name, ...aliases].filter(
          (n, i, all) => n !== entry.name && !entry.aliases.includes(n) && all.indexOf(n) === i,
        )
        if (added.length > 0) {
          proposals.push(
            makeProposal(ctx, 'entry_update', {
              entryId: entry.id,
              entryName: entry.name,
              patch: { aliases: added },
            }),
          )
          wiki.add(added, entry, entry.kind)
        }
      }
      continue
    }

    created.add([name, ...aliases], name, e.kind)
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

  // Facts: subject binds to a wiki card when one matches (pending and new entries stay null).
  const seenFacts = new Set<string>()
  for (const f of x.facts) {
    const content = collapse(f.content)
    if (!content) continue
    const subjectName = f.subjectName.trim()
    if (isRoleName(subjectName)) continue
    const kind = kindOfEntry(subjectName)
    const hit = locate(subjectName, kind)
    const key = `${identityOf(subjectName, hit)}|${content}`
    if (seenFacts.has(key)) continue
    seenFacts.add(key)

    proposals.push(
      makeProposal(ctx, 'fact_create', {
        subjectName,
        entryId: hit?.source === 'wiki' ? hit.entry.id : null,
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
  // -> thread_create, unless the wiki or a pending proposal already has them. developed/resolved
  // -> thread_event, or pending when the target is a not-yet-approved thread; anything else is dropped.
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
      // A planted thread that a pending thread_create already proposes is not created again.
      if ([...(ctx.pendingThreadCreateTitles ?? [])].some((p) => collapse(p) === collapse(title))) {
        continue
      }
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

  // Relations: undirected, starting at the chapter position. A role word at either end is dropped.
  const seenRelations = new Set<string>()
  for (const r of x.relations) {
    const sourceName = r.sourceName.trim()
    const targetName = r.targetName.trim()
    if (!sourceName || !targetName) continue
    if (isRoleName(sourceName) || isRoleName(targetName)) continue
    const kind = collapse(r.kind)
    const sourceKind = kindOfEntry(sourceName)
    const targetKind = kindOfEntry(targetName)
    const sourceHit = locate(sourceName, sourceKind)
    const targetHit = locate(targetName, targetKind)
    if (
      sourceHit?.source === 'wiki' &&
      targetHit?.source === 'wiki' &&
      ctx.existingRelations?.some((rel) =>
        coversRelation(rel, sourceHit.entry.id, targetHit.entry.id, kind, ctx.chapterPosition),
      )
    ) {
      continue
    }
    const key = `${identityOf(sourceName, sourceHit)}|${identityOf(targetName, targetHit)}|${kind}`
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
