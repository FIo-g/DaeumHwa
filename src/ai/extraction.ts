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
import { isNearDuplicateFact } from '@/ai/guards'
import { verifyEvidenceQuote } from '@/lib/evidence-quote'

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

// The split chapter extraction (local providers) asks for three parts, one call each. Each part
// schema is a pick of the full schema, so the part outputs carry the same fields and rules.
export const FactsPartSchema = ExtractionSchema.pick({ summary: true, entries: true, facts: true })
export const ThreadsPartSchema = ExtractionSchema.pick({ threads: true })
export const RelationsPartSchema = ExtractionSchema.pick({ relations: true })

export type FactsPart = z.infer<typeof FactsPartSchema>
export type ThreadsPart = z.infer<typeof ThreadsPartSchema>
export type RelationsPart = z.infer<typeof RelationsPartSchema>

/** Joins the three part outputs into one Extraction. Pure: no AI call. */
export function mergeExtractionParts(parts: {
  facts: FactsPart
  threads: ThreadsPart
  relations: RelationsPart
}): Extraction {
  return {
    summary: parts.facts.summary,
    entries: parts.facts.entries,
    facts: parts.facts.facts,
    threads: parts.threads.threads,
    relations: parts.relations.relations,
  }
}

export type ExtractionContext = {
  source: ProposalSource
  sourceRef: string | null
  chapterId: string | null
  chapterPosition: number | null
  /** `speech` is the card's 말투 field: undefined when unknown, '' when the card has none. */
  existingEntries: {
    id: string
    name: string
    aliases: string[]
    kind: EntryKind
    speech?: string
  }[]
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
  /** Source text the model read. When set, every evidence quote must appear in it. */
  sourceText?: string
  /** Current wiki facts and pending fact_create texts. A near-duplicate of one of them is not proposed again. */
  existingFacts?: ExistingFactText[]
  /** Speech feature on (spec 8, track B): speech keys are normalized and an interview fills a missing speech. */
  speechStyle?: boolean
  /** Entries with a pending entry_update that already sets speech. They get no second speech update. */
  pendingSpeechEntryIds?: string[]
}

/** A fact the work already has (or has pending), as the dedupe needs it. */
export type ExistingFactText = {
  entryId: string | null
  subjectName: string
  content: string
}

/** A thread event whose target is a pending (not yet approved) thread_create. T16 attaches these. */
export type PendingThreadEvent = {
  title: string
  kind: 'developed' | 'resolved'
  evidence: string
}

/** Counters of what the mapper changed. Always present; zero until a rule counts into them. */
export type ExtractionStats = {
  /** Names rewritten from a tail fragment to a full card name (counts entries, fact subjects and relation ends). */
  fragmentNamesFixed: number
  /** relation_create candidates dropped because an end matched no card. */
  relationsDropped: number
}

export type ExtractionDropped = {
  /** Facts dropped as near-duplicates of an existing or earlier fact of this extraction. */
  duplicateFacts: number
  /** Facts, threads and relations dropped because their evidence is not in the source text. */
  unverifiedEvidence: number
}

type ExistingEntry = ExtractionContext['existingEntries'][number]
type ThreadTarget = { id: string; title: string; status?: ThreadStatus }

/** Field keys the model may use for a character's speech style. All of them map to "speech". */
const SPEECH_KEYS = new Set(['speech', '말투', '화법', '말버릇', 'voice'])

function normalizeFieldKey(key: string): string {
  const trimmed = key.trim()
  return SPEECH_KEYS.has(trimmed.toLowerCase()) ? 'speech' : trimmed
}

/**
 * Field values of one entry by key, trimmed. The first value of a key wins; with the speech
 * feature on, speech keys share one key and the first non-empty speech wins.
 */
function fieldMapOf(
  fields: { key: string; value: string }[],
  speechStyle: boolean,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of fields) {
    const key = speechStyle ? normalizeFieldKey(f.key) : f.key.trim()
    if (!key) continue
    const value = f.value.trim()
    const current = map.get(key)
    if (current === undefined || (speechStyle && key === 'speech' && current === '')) {
      map.set(key, value)
    }
  }
  return map
}

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
 * The full character card name a tail fragment stands for ("세린" -> "한세린"). Only a character
 * or unknown kind matches, only a single-word card name ending with the fragment, with a one or
 * two syllable surname in front. Prefixes and middle matches do not count. Returns undefined when
 * no card or more than one card qualifies, or when a form is already a card name.
 */
export function findFragmentCanonical(
  name: string,
  kind: EntryKind | undefined,
  cardNames: readonly string[],
): string | undefined {
  if (kind !== undefined && kind !== 'character') return undefined
  const forms = nameCandidates(name)
  if (forms.some((form) => cardNames.includes(form))) return undefined
  for (const form of forms) {
    if (/\s/.test(form) || form.length < 2) continue
    const matches = [
      ...new Set(
        cardNames.filter((card) => {
          const extra = card.length - form.length
          return !/\s/.test(card) && card.endsWith(form) && extra >= 1 && extra <= 2
        }),
      ),
    ]
    if (matches.length > 0) return matches.length === 1 ? matches[0] : undefined
  }
  return undefined
}

/**
 * Names and aliases of cards, looked up by a name from the model. Exact and particle-stripped
 * forms match any card. The last word of a spaced name matches character cards only, and only
 * when the incoming kind is character or unknown ("북쪽 시계탑" never joins a place "시계탑").
 * The last word of a spaced character card name also works the other way: a bare "노은하" finds
 * "전직 시계탑 수리공 노은하", whichever of the two came first.
 */
class NameIndex<T> {
  private readonly all = new Map<string, T>()
  private readonly characters = new Map<string, T>()
  /** Last word of a spaced character card name, looked up by a single-word name. Never written out. */
  private readonly lastWords = new Map<string, T>()

  /** The first item registered under a name wins. `kind` is the kind of the item's card. */
  add(names: string[], item: T, kind: EntryKind | undefined): void {
    for (const raw of names) {
      const key = raw.trim()
      if (!key) continue
      if (!this.all.has(key)) this.all.set(key, item)
      if (kind === 'character' && !this.characters.has(key)) this.characters.set(key, item)
    }
  }

  /** Registers a card's own name, which also makes its last word a lookup key. Aliases use `add`. */
  addCard(name: string, item: T, kind: EntryKind | undefined): void {
    this.add([name], item, kind)
    const key = name.trim()
    const words = key.split(/\s+/)
    if (kind === 'character' && words.length >= 2 && !this.lastWords.has(words[words.length - 1])) {
      this.lastWords.set(words[words.length - 1], item)
    }
  }

  /**
   * `lastWord: false` limits the lookup to exact and particle-stripped forms. Aliases use it, so
   * a long alias does not merge a different person through its last word.
   */
  find(
    name: string,
    kind: EntryKind | undefined,
    options: { lastWord?: boolean } = {},
  ): T | undefined {
    for (const form of nameCandidates(name)) {
      const hit = this.all.get(form)
      if (hit) return hit
    }
    if (options.lastWord === false || (kind !== undefined && kind !== 'character')) return undefined
    const words = name.trim().split(/\s+/)
    if (words.length >= 2) {
      for (const form of nameCandidates(words[words.length - 1])) {
        const hit = this.characters.get(form)
        if (hit) return hit
      }
      return undefined
    }
    for (const form of nameCandidates(name)) {
      const hit = this.lastWords.get(form)
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
): {
  proposals: NewProposal[]
  pendingThreadEvents: PendingThreadEvent[]
  stats: ExtractionStats
  dropped: ExtractionDropped
} {
  const proposals: NewProposal[] = []
  const pendingThreadEvents: PendingThreadEvent[] = []
  const stats: ExtractionStats = { fragmentNamesFixed: 0, relationsDropped: 0 }
  const dropped: ExtractionDropped = { duplicateFacts: 0, unverifiedEvidence: 0 }

  // Cards a name can refer to, searched in this order: wiki cards, pending entry_create
  // proposals, then names created earlier in this extraction.
  const wiki = new NameIndex<ExistingEntry>()
  for (const e of ctx.existingEntries) {
    wiki.addCard(e.name, e, e.kind)
    wiki.add(e.aliases, e, e.kind)
  }
  const pending = new NameIndex<string>()
  for (const p of ctx.pendingEntries ?? []) {
    pending.addCard(p.name, p.name, p.kind)
    pending.add(p.aliases, p.name, p.kind)
  }
  const created = new NameIndex<string>()

  type Hit =
    { source: 'wiki'; entry: ExistingEntry } | { source: 'pending' | 'created'; name: string }
  const locate = (
    name: string,
    kind: EntryKind | undefined,
    options: { lastWord?: boolean } = {},
  ): Hit | undefined => {
    const entry = wiki.find(name, kind, options)
    if (entry) return { source: 'wiki', entry }
    const pendingName = pending.find(name, kind, options)
    if (pendingName !== undefined) return { source: 'pending', name: pendingName }
    const createdName = created.find(name, kind, options)
    if (createdName !== undefined) return { source: 'created', name: createdName }
    return undefined
  }
  // Identity of a name for dedupe: the card it matches, else the name itself.
  const identityOf = (name: string, hit: Hit | undefined): string => {
    if (!hit) return `name:${name}`
    return hit.source === 'wiki' ? `wiki:${hit.entry.id}` : `${hit.source}:${hit.name}`
  }
  // The name written into a proposal: the card's own name when the name matched one, else as given.
  const canonicalName = (name: string, hit: Hit | undefined): string => {
    if (!hit) return name
    return hit.source === 'wiki' ? hit.entry.name : hit.name
  }
  // Kind of an extracted entry with this name, when the extraction has one.
  const kindOfEntry = (name: string): EntryKind | undefined => {
    for (const form of nameCandidates(name)) {
      const hit = x.entries.find((e) => e.name.trim() === form)
      if (hit) return hit.kind
    }
    return undefined
  }

  // Evidence as stored: the raw text when no source is set, else the verified source slice. A
  // quote that is not in the source is counted and returns null.
  const evidenceOf = (raw: string): string | null => {
    if (ctx.sourceText === undefined) return raw.trim()
    const verified = verifyEvidenceQuote(ctx.sourceText, raw)
    if (verified === null) dropped.unverifiedEvidence += 1
    return verified
  }
  // Fact texts already on the work for this card: a wiki card's facts, else the facts of a
  // pending or new card that has no wiki id, matched by subject name.
  const existingFactTexts = (subjectName: string, hit: Hit | undefined): string[] => {
    const canonical = collapse(canonicalName(subjectName, hit))
    return (ctx.existingFacts ?? [])
      .filter((c) =>
        hit?.source === 'wiki'
          ? c.entryId === hit.entry.id
          : c.entryId === null && collapse(c.subjectName) === canonical,
      )
      .map((c) => c.content)
  }

  // Character card names a tail fragment may complete: wiki and pending cards, then character
  // entries of this extraction. A name's own entry is left out of its candidates, so an entry
  // "세린" beside "한세린" can still be rewritten.
  const dbNames = [
    ...new Set(
      [
        ...ctx.existingEntries.filter((e) => e.kind === 'character').map((e) => e.name),
        ...(ctx.pendingEntries ?? []).filter((p) => p.kind === 'character').map((p) => p.name),
      ].map((n) => n.trim()),
    ),
  ]
  const extractionNames = x.entries
    .filter((e) => e.kind === 'character' && e.name.trim() && !isRoleName(e.name))
    .map((e) => e.name.trim())
  // The full card name for a tail fragment, or the name as given. A name that already matches a
  // card is kept as is.
  const resolveFragment = (raw: string, kind: EntryKind | undefined): string => {
    const name = raw.trim()
    if (locate(name, kind)) return name
    const cardNames = [...new Set([...dbNames, ...extractionNames.filter((n) => n !== name)])]
    const full = findFragmentCanonical(name, kind, cardNames)
    if (full === undefined) return name
    stats.fragmentNamesFixed += 1
    return full
  }

  // Entries: a name that matches a card is skipped (a speech feature may still fill its speech);
  // an alias that matches a wiki card adds the new name to that card; anything else becomes
  // entry_create (deduped by name).
  const speechStyle = ctx.speechStyle === true
  const pendingSpeech = new Set(ctx.pendingSpeechEntryIds ?? [])
  const speechUpdated = new Set<string>()
  for (const e of x.entries) {
    const name = e.name.trim()
    if (!name || isRoleName(name)) continue
    // A tail fragment ("세린" for "한세린") is not a card of its own: the full card is elsewhere.
    if (resolveFragment(name, e.kind) !== name) continue

    const aliases: string[] = []
    for (const raw of e.aliases) {
      const alias = raw.trim()
      if (alias && alias !== name && !isRoleName(alias) && !aliases.includes(alias)) {
        aliases.push(alias)
      }
    }

    const fieldMap = fieldMapOf(e.fields, speechStyle)
    const hit = locate(name, e.kind)
    if (hit) {
      // Speech fills only a wiki card whose speech is empty, from an interview, once per card.
      const speech = fieldMap.get('speech') ?? ''
      if (
        speechStyle &&
        ctx.source === 'interview' &&
        hit.source === 'wiki' &&
        hit.entry.speech !== undefined &&
        hit.entry.speech.trim() === '' &&
        speech !== '' &&
        !pendingSpeech.has(hit.entry.id) &&
        !speechUpdated.has(hit.entry.id)
      ) {
        proposals.push(
          makeProposal(ctx, 'entry_update', {
            entryId: hit.entry.id,
            entryName: hit.entry.name,
            patch: { fields: { speech } },
          }),
        )
        speechUpdated.add(hit.entry.id)
      }
      continue
    }

    // Aliases match exactly or after a particle only (see NameIndex.find).
    const aliasHit = aliases
      .map((alias) => locate(alias, e.kind, { lastWord: false }))
      .find((hit) => hit !== undefined)
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
      } else {
        // The alias names a pending or new card. Later references to this name resolve to that card.
        created.add([name, ...aliases], aliasHit.name, e.kind)
      }
      continue
    }

    created.addCard(name, name, e.kind)
    created.add(aliases, name, e.kind)
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
  // Contents kept so far per card identity, for the near-duplicate check within this extraction.
  const keptFacts = new Map<string, string[]>()
  for (const f of x.facts) {
    const content = collapse(f.content)
    if (!content) continue
    const rawSubject = f.subjectName.trim()
    if (isRoleName(rawSubject)) continue
    const kind = kindOfEntry(rawSubject)
    const subjectName = resolveFragment(rawSubject, kind)
    const hit = locate(subjectName, kind)
    const identity = identityOf(subjectName, hit)
    const supersedesFactId = lookupRef(ctx.factRefs, f.supersedesFactRef)?.id ?? null
    // A state change (supersede) is never a duplicate of the fact it replaces.
    const isState = supersedesFactId !== null

    if (
      !isState &&
      existingFactTexts(subjectName, hit).some((c) => isNearDuplicateFact(c, content))
    ) {
      dropped.duplicateFacts += 1
      continue
    }
    const evidence = evidenceOf(f.evidence)
    if (evidence === null) continue

    const key = `${identity}|${content}`
    if (seenFacts.has(key)) continue
    if (!isState && (keptFacts.get(identity) ?? []).some((c) => isNearDuplicateFact(c, content))) {
      dropped.duplicateFacts += 1
      continue
    }
    seenFacts.add(key)
    keptFacts.set(identity, [...(keptFacts.get(identity) ?? []), content])

    proposals.push(
      makeProposal(ctx, 'fact_create', {
        subjectName: canonicalName(subjectName, hit),
        entryId: hit?.source === 'wiki' ? hit.entry.id : null,
        content,
        suggestedStatus: f.suggestedStatus,
        sourceChapterId: ctx.chapterId,
        evidence,
        supersedesFactId,
      }),
    )
  }

  // Threads. A target is an existing thread: by the model's ref, or for a planted thread by
  // title. Planted into an interview-planned thread -> one planted event. Other planted threads
  // -> thread_create, unless the wiki or a pending proposal already has them. developed/resolved
  // -> thread_event, or pending when the target is a not-yet-approved thread; anything else is dropped.
  // A chapter (not an interview) plants the threads an interview planned.
  const plantsPlanned = ctx.source !== 'interview' && Boolean(ctx.chapterId)
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
    const match = ctx.existingThreads?.find((th) => collapse(th.title) === collapse(title))
    if (kind === 'planted') return match
    // A developed or resolved mention without a usable ref still records the planting of a
    // planned thread that a chapter now plants.
    return match?.status === 'planned' && plantsPlanned ? match : undefined
  }

  const seenCreates = new Set<string>()
  const seenEvents = new Set<string>()
  for (const t of x.threads) {
    const title = t.title.trim()
    if (!title) continue
    const evidence = evidenceOf(t.evidence)
    if (evidence === null) continue
    const description = t.description.trim()

    const target = threadTargetOf(t.existingThreadRef, title, t.kind)
    if (target) {
      if (target.status === 'planned' && plantsPlanned) {
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
    const rawSource = r.sourceName.trim()
    const rawTarget = r.targetName.trim()
    if (!rawSource || !rawTarget) continue
    if (isRoleName(rawSource) || isRoleName(rawTarget)) continue
    const kind = collapse(r.kind)
    const sourceKind = kindOfEntry(rawSource)
    const targetKind = kindOfEntry(rawTarget)
    const sourceName = resolveFragment(rawSource, sourceKind)
    const targetName = resolveFragment(rawTarget, targetKind)
    const sourceHit = locate(sourceName, sourceKind)
    const targetHit = locate(targetName, targetKind)
    // An end that matches no card anywhere would fail at approval, so the relation is not proposed.
    if (!sourceHit || !targetHit) {
      stats.relationsDropped += 1
      continue
    }
    // Relation ends are written as the card's own name, so they resolve at approval.
    if (
      sourceHit?.source === 'wiki' &&
      targetHit?.source === 'wiki' &&
      ctx.existingRelations?.some((rel) =>
        coversRelation(rel, sourceHit.entry.id, targetHit.entry.id, kind, ctx.chapterPosition),
      )
    ) {
      continue
    }
    const evidence = evidenceOf(r.evidence)
    if (evidence === null) continue
    const key = `${identityOf(sourceName, sourceHit)}|${identityOf(targetName, targetHit)}|${kind}`
    if (seenRelations.has(key)) continue
    seenRelations.add(key)
    proposals.push(
      makeProposal(ctx, 'relation_create', {
        sourceName: canonicalName(sourceName, sourceHit),
        targetName: canonicalName(targetName, targetHit),
        kind: r.kind.trim(),
        description: r.description.trim(),
        directed: false,
        startPosition: ctx.chapterPosition,
        evidence,
      }),
    )
  }

  // Chapter summary: only when the source is a chapter.
  const summary = x.summary?.trim()
  if (summary && ctx.chapterId) {
    proposals.push(makeProposal(ctx, 'chapter_summary', { chapterId: ctx.chapterId, summary }))
  }

  return { proposals, pendingThreadEvents, stats, dropped }
}
