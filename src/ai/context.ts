import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, facts, namingRules, relations, threads, wikiEntries } from '@/db/schema'
import type { EntryKind, FactStatus, Importance, ThreadStatus } from '@/db/types'
import { findMentions } from '@/lib/korean/mentions'
import {
  CHARACTER_FIELD_LABELS,
  ENTRY_KIND_LABEL,
  FACT_STATUS_LABEL,
  IMPORTANCE_LABEL,
  PLACE_FIELD_LABELS,
  THREAD_STATUS_LABEL,
} from '@/lib/labels'

// Context pack (spec F9): the cards, facts, threads and summaries that one manuscript passage
// needs, selected for a given chapter position and trimmed to a character budget.

export type PackFact = {
  ref: string
  id: string
  content: string
  status: FactStatus
  sourcePosition: number | null
  validFromPosition: number | null
  validToPosition: number | null
  evidence: string
}

export type PackEntry = {
  ref: string
  id: string
  kind: EntryKind
  name: string
  aliases: string[]
  summary: string
  fields: Record<string, string>
  mentionCount: number
  facts: PackFact[]
}

export type PackThread = {
  ref: string
  id: string
  title: string
  description: string
  status: ThreadStatus
  plantedPosition: number | null
  targetPosition: number | null
  importance: Importance
  overdue: boolean
}

export type ContextPack = {
  position: number
  entries: PackEntry[]
  threads: PackThread[]
  relations: { sourceName: string; targetName: string; kind: string; description: string }[]
  previousSummaries: { position: number; title: string; summary: string }[]
  namingRules: { canonical: string; variants: string[] }[]
  stats: { totalEntries: number; selectedEntries: number; approxChars: number }
}

const DEFAULT_BUDGET_CHARS = 12_000
const MAX_FACTS_PER_ENTRY = 15
const MAX_THREADS = 15
const PREVIOUS_SUMMARY_COUNT = 2
const OPEN_THREAD_STATUSES: ThreadStatus[] = ['planned', 'planted', 'developing']
const STATUS_RANK: Record<FactStatus, number> = { confirmed: 0, assumed: 1, undecided: 2 }
const IMPORTANCE_RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 }
const FIELD_LABELS: Record<string, string> = {
  ...CHARACTER_FIELD_LABELS,
  ...PLACE_FIELD_LABELS,
}

type Unref<T> = Omit<T, 'ref'>

interface SelectedEntry {
  id: string
  kind: EntryKind
  name: string
  aliases: string[]
  summary: string
  fields: Record<string, string>
  mentionCount: number
  facts: Unref<PackFact>[]
}

interface RelationCandidate {
  sourceId: string
  targetId: string
  sourceName: string
  targetName: string
  kind: string
  description: string
}

/** Working set before refs are assigned. Trimming removes items from the end of each list. */
interface Selection {
  entries: SelectedEntry[]
  threads: Unref<PackThread>[]
  relations: RelationCandidate[]
  previousSummaries: ContextPack['previousSummaries']
  namingRules: ContextPack['namingRules']
}

/**
 * Builds the context pack for a manuscript passage at a chapter position.
 * Entries are chosen by name mention (plus `extraEntryIds`), then their facts valid at that
 * position, open threads, relations among the chosen entries, the previous chapter summaries
 * and the naming rules. When the rendered pack is over `budgetChars`, the lowest-ranked items
 * are dropped first: relations, then threads, then the oldest summaries, then entries.
 */
export async function buildContextPack(
  db: Db,
  workId: string,
  input: { text: string; position: number; extraEntryIds?: string[]; budgetChars?: number },
): Promise<ContextPack> {
  const position = input.position
  const budget = input.budgetChars ?? DEFAULT_BUDGET_CHARS

  const chapterRows = await db
    .select({
      id: chapters.id,
      position: chapters.position,
      title: chapters.title,
      summary: chapters.summary,
      archivedAt: chapters.archivedAt,
    })
    .from(chapters)
    .where(eq(chapters.workId, workId))
  const chapterPosition = new Map(chapterRows.map((c) => [c.id, c.position]))

  const entryRows = await db
    .select()
    .from(wikiEntries)
    .where(and(eq(wikiEntries.workId, workId), isNull(wikiEntries.archivedAt)))
  const entryById = new Map(entryRows.map((e) => [e.id, e]))

  const mentions = findMentions(
    input.text,
    entryRows.map((e) => ({ id: e.id, names: [e.name, ...e.aliases] })),
  )
  const mentionCount = new Map(mentions.map((m) => [m.entryId, m.count]))
  const chosenIds: string[] = []
  for (const m of mentions) chosenIds.push(m.entryId)
  for (const id of input.extraEntryIds ?? []) {
    if (entryById.has(id) && !chosenIds.includes(id)) chosenIds.push(id)
  }

  const factRows = chosenIds.length
    ? await db
        .select()
        .from(facts)
        .where(
          and(
            eq(facts.workId, workId),
            isNull(facts.archivedAt),
            inArray(facts.entryId, chosenIds),
          ),
        )
    : []

  const selectedEntries: SelectedEntry[] = chosenIds.map((id) => {
    const entry = entryById.get(id) as (typeof entryRows)[number]
    const usable = factRows
      .filter((f) => f.entryId === id && isFactValidAt(f, position))
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, MAX_FACTS_PER_ENTRY)
    return {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      aliases: entry.aliases,
      summary: entry.summary,
      fields: mergeCustomFields(entry.fields, entry.customFields),
      mentionCount: mentionCount.get(entry.id) ?? 0,
      facts: usable.map((f) => ({
        id: f.id,
        content: f.content,
        status: f.status,
        sourcePosition: f.sourceChapterId ? (chapterPosition.get(f.sourceChapterId) ?? null) : null,
        validFromPosition: f.validFromPosition,
        validToPosition: f.validToPosition,
        evidence: f.evidence,
      })),
    }
  })

  const threadRows = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.workId, workId),
        isNull(threads.archivedAt),
        inArray(threads.status, OPEN_THREAD_STATUSES),
      ),
    )
  const openThreads: Unref<PackThread>[] = threadRows
    .map((t) => {
      const plantedPosition = t.plantedChapterId
        ? (chapterPosition.get(t.plantedChapterId) ?? null)
        : null
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        plantedPosition,
        targetPosition: t.targetChapterPosition,
        importance: t.importance,
        overdue: t.targetChapterPosition !== null && position > t.targetChapterPosition,
      }
    })
    .filter(
      (t) =>
        t.status === 'planned' || (t.plantedPosition !== null && t.plantedPosition <= position),
    )
    .sort(
      (a, b) =>
        IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] ||
        Number(b.overdue) - Number(a.overdue) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, MAX_THREADS)

  const relationRows = await db
    .select()
    .from(relations)
    .where(and(eq(relations.workId, workId), isNull(relations.archivedAt)))
  const chosenSet = new Set(chosenIds)
  const relationCandidates: RelationCandidate[] = relationRows
    .filter(
      (r) =>
        chosenSet.has(r.sourceEntryId) &&
        chosenSet.has(r.targetEntryId) &&
        isRelationValidAt(r.startPosition, r.endPosition, position),
    )
    .map((r) => ({
      sourceId: r.sourceEntryId,
      targetId: r.targetEntryId,
      sourceName: entryById.get(r.sourceEntryId)?.name ?? '',
      targetName: entryById.get(r.targetEntryId)?.name ?? '',
      kind: r.kind,
      description: r.description,
    }))
    .sort(
      (a, b) =>
        a.sourceName.localeCompare(b.sourceName) ||
        a.targetName.localeCompare(b.targetName) ||
        a.kind.localeCompare(b.kind) ||
        a.description.localeCompare(b.description),
    )

  const previousSummaries = chapterRows
    .filter((c) => c.archivedAt === null && c.summary.trim() !== '' && c.position < position)
    .sort((a, b) => b.position - a.position)
    .slice(0, PREVIOUS_SUMMARY_COUNT)
    .reverse()
    .map((c) => ({ position: c.position, title: c.title, summary: c.summary }))

  const ruleRows = await db
    .select()
    .from(namingRules)
    .where(and(eq(namingRules.workId, workId), isNull(namingRules.archivedAt)))
  const rules = ruleRows
    .sort((a, b) => a.canonical.localeCompare(b.canonical) || a.id.localeCompare(b.id))
    .map((r) => ({ canonical: r.canonical, variants: r.variants }))

  const selection: Selection = {
    entries: selectedEntries,
    threads: openThreads,
    relations: relationCandidates,
    previousSummaries,
    namingRules: rules,
  }

  while (renderPack(assemble(position, selection, entryRows.length)).length > budget) {
    if (selection.relations.length > 0) {
      selection.relations.pop()
    } else if (selection.threads.length > 0) {
      selection.threads.pop()
    } else if (selection.previousSummaries.length > 0) {
      selection.previousSummaries.shift()
    } else if (selection.entries.length > 0) {
      const dropped = selection.entries.pop() as SelectedEntry
      selection.relations = selection.relations.filter(
        (r) => r.sourceId !== dropped.id && r.targetId !== dropped.id,
      )
    } else {
      break
    }
  }

  const pack = assemble(position, selection, entryRows.length)
  pack.stats.approxChars = renderPack(pack).length
  return pack
}

/** Deterministic text form of a pack, used in prompts. Same pack in, same bytes out. */
export function renderContextPack(pack: ContextPack): string {
  const lines: string[] = [`현재 회차: ${pack.position}화`, '']

  lines.push('<entries>')
  if (pack.entries.length === 0) lines.push('(없음)')
  for (const entry of pack.entries) {
    lines.push(`[${entry.ref}] ${entry.name} (${ENTRY_KIND_LABEL[entry.kind]})`)
    if (entry.aliases.length > 0) lines.push(`- 별칭: ${entry.aliases.join(', ')}`)
    if (entry.summary) lines.push(`- 요약: ${entry.summary}`)
    for (const key of Object.keys(entry.fields).sort()) {
      lines.push(`- ${FIELD_LABELS[key] ?? key}: ${entry.fields[key]}`)
    }
    for (const fact of entry.facts) lines.push(`- ${renderFact(fact)}`)
  }
  lines.push('</entries>', '')

  lines.push('<threads>')
  if (pack.threads.length === 0) lines.push('(없음)')
  for (const thread of pack.threads) lines.push(renderThread(thread))
  lines.push('</threads>', '')

  lines.push('<relations>')
  if (pack.relations.length === 0) lines.push('(없음)')
  for (const r of pack.relations) {
    const kind = r.kind ? ` (${r.kind})` : ''
    const description = r.description ? `: ${r.description}` : ''
    lines.push(`- ${r.sourceName} → ${r.targetName}${kind}${description}`)
  }
  lines.push('</relations>', '')

  lines.push('<previous_chapters>')
  if (pack.previousSummaries.length === 0) lines.push('(없음)')
  for (const s of pack.previousSummaries) {
    const title = s.title.trim() ? ` ${s.title.trim()}` : ''
    lines.push(`- ${s.position}화${title}: ${s.summary}`)
  }
  lines.push('</previous_chapters>', '')

  lines.push('<naming>')
  if (pack.namingRules.length === 0) lines.push('(없음)')
  for (const rule of pack.namingRules) {
    const variants = rule.variants.length > 0 ? `: 잘못된 표기 ${rule.variants.join(', ')}` : ''
    lines.push(`- ${rule.canonical}${variants}`)
  }
  lines.push('</naming>')

  return lines.join('\n')
}

/** Maps every ref in a pack back to its record. Facts also carry their entry id. */
export function resolveRefs(pack: ContextPack): {
  facts: Map<string, PackFact & { entryId: string }>
  entries: Map<string, PackEntry>
  threads: Map<string, PackThread>
} {
  const factMap = new Map<string, PackFact & { entryId: string }>()
  const entryMap = new Map<string, PackEntry>()
  for (const entry of pack.entries) {
    entryMap.set(entry.ref, entry)
    for (const fact of entry.facts) factMap.set(fact.ref, { ...fact, entryId: entry.id })
  }
  const threadMap = new Map(pack.threads.map((t) => [t.ref, t]))
  return { facts: factMap, entries: entryMap, threads: threadMap }
}

function assemble(position: number, selection: Selection, totalEntries: number): ContextPack {
  let factCount = 0
  const entries: PackEntry[] = selection.entries.map((entry, index) => ({
    ref: `E${index + 1}`,
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    aliases: entry.aliases,
    summary: entry.summary,
    fields: entry.fields,
    mentionCount: entry.mentionCount,
    facts: entry.facts.map((fact) => {
      factCount += 1
      return { ...fact, ref: `F${factCount}` }
    }),
  }))
  const threadList: PackThread[] = selection.threads.map((thread, index) => ({
    ...thread,
    ref: `T${index + 1}`,
  }))
  return {
    position,
    entries,
    threads: threadList,
    relations: selection.relations.map((r) => ({
      sourceName: r.sourceName,
      targetName: r.targetName,
      kind: r.kind,
      description: r.description,
    })),
    previousSummaries: selection.previousSummaries,
    namingRules: selection.namingRules,
    stats: { totalEntries, selectedEntries: entries.length, approxChars: 0 },
  }
}

function renderPack(pack: ContextPack): string {
  return renderContextPack(pack)
}

function renderFact(fact: PackFact): string {
  const parts: string[] = []
  if (fact.sourcePosition !== null) parts.push(`출처 ${fact.sourcePosition}화`)
  const range = validityText(fact.validFromPosition, fact.validToPosition)
  if (range) parts.push(range)
  const parens = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `[${fact.ref}][${FACT_STATUS_LABEL[fact.status]}] ${fact.content}${parens}`
}

function renderThread(thread: PackThread): string {
  const meta = [`중요도 ${IMPORTANCE_LABEL[thread.importance]}`, THREAD_STATUS_LABEL[thread.status]]
  if (thread.plantedPosition !== null) meta.push(`${thread.plantedPosition}화에 심음`)
  if (thread.targetPosition !== null) meta.push(`목표 ${thread.targetPosition}화`)
  if (thread.overdue) meta.push('지연')
  const description = thread.description ? `: ${thread.description}` : ''
  return `- [${thread.ref}] ${thread.title} (${meta.join(', ')})${description}`
}

function validityText(from: number | null, to: number | null): string | null {
  if (from !== null && to !== null) return `${from}~${to}화`
  if (from !== null) return `${from}화부터`
  if (to !== null) return `~${to}화`
  return null
}

/** A fact applies at `position` when the position is inside its validity range (open ends are unbounded). */
function isFactValidAt(
  fact: { validFromPosition: number | null; validToPosition: number | null },
  position: number,
): boolean {
  if (fact.validFromPosition !== null && position < fact.validFromPosition) return false
  if (fact.validToPosition !== null && position > fact.validToPosition) return false
  return true
}

function isRelationValidAt(start: number | null, end: number | null, position: number): boolean {
  if (start !== null && position < start) return false
  if (end !== null && position > end) return false
  return true
}

function mergeCustomFields(
  fields: Record<string, string>,
  customFields: { key: string; value: string }[],
): Record<string, string> {
  const merged: Record<string, string> = { ...fields }
  for (const field of customFields) {
    if (field.key && !(field.key in merged)) merged[field.key] = field.value
  }
  return merged
}
