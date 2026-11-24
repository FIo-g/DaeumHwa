import type { ReactNode } from 'react'
import { ChapterSummaries } from '@/components/wiki/chapter-summaries'
import { DirectiveList } from '@/components/wiki/directive-list'
import { EntryList, type EntryListItem } from '@/components/wiki/entry-list'
import { NamingRules } from '@/components/wiki/naming-rules'
import { StyleCards } from '@/components/wiki/style-cards'
import { SettingsBoardHeader } from '@/components/wiki/wiki-tabs'
import { ENTRY_KINDS, type EntryKind } from '@/db/types'
import { getFirstAppearances } from '@/server/appearances'
import { hasRole } from '@/server/access'
import { listChapters } from '@/server/chapters'
import { listInferredProposals } from '@/server/directive-infer'
import { listDirectives } from '@/server/directives'
import { listFacts } from '@/server/facts'
import { listNamingRules } from '@/server/naming'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listStyleCards } from '@/server/styles'
import { getWork } from '@/server/works'
import { listEntries } from '@/server/wiki'

// Style card suggestions run AI tasks from this page.
export const maxDuration = 300

const TABS = ['characters', 'world', 'naming', 'summaries', 'styles', 'requests'] as const
const WORLD_KINDS: EntryKind[] = ENTRY_KINDS.filter((k) => k !== 'character')

export default async function WikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>
  searchParams: Promise<{ tab?: string; kind?: string; q?: string; entry?: string }>
}) {
  const { workId } = await params
  const sp = await searchParams
  const { db, actor, user } = await pageContext(`/works/${workId}/wiki`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const canEdit = hasRole(work.role, 'editor')

  const tab: (typeof TABS)[number] = (TABS as readonly string[]).includes(sp.tab ?? '')
    ? (sp.tab as (typeof TABS)[number])
    : 'characters'
  const query = (sp.q ?? '').trim()
  const kindFilter = WORLD_KINDS.find((k) => k === sp.kind) ?? null

  let content: ReactNode
  if (tab === 'characters' || tab === 'world') {
    const listKinds: EntryKind[] =
      tab === 'characters' ? ['character'] : kindFilter ? [kindFilter] : WORLD_KINDS
    const [entries, facts, appearances] = await Promise.all([
      guardPage(() => listEntries(db, actor, workId, { kinds: listKinds })),
      guardPage(() => listFacts(db, actor, workId)),
      getFirstAppearances(db, workId),
    ])
    const factsByEntry = new Map<string, EntryListItem['facts']>()
    for (const fact of facts) {
      if (!fact.entryId) continue
      const previews = factsByEntry.get(fact.entryId) ?? []
      previews.push({
        id: fact.id,
        content: fact.content,
        status: fact.status,
        validFromPosition: fact.validFromPosition,
        validToPosition: fact.validToPosition,
      })
      factsByEntry.set(fact.entryId, previews)
    }
    const items: EntryListItem[] = entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      summary: e.summary,
      factCount: factsByEntry.get(e.id)?.length ?? 0,
      facts: factsByEntry.get(e.id) ?? [],
      firstAppearance: appearances.get(e.id) ?? null,
    }))
    content = (
      <EntryList
        key={`${tab}:${kindFilter}:${query}:${sp.entry ?? ''}`}
        workId={workId}
        tab={tab}
        entries={items}
        kinds={tab === 'characters' ? ['character'] : WORLD_KINDS}
        defaultKind={tab === 'characters' ? 'character' : 'place'}
        filterKinds={tab === 'world' ? WORLD_KINDS : undefined}
        kindFilter={kindFilter}
        query={query}
        initialEntryId={sp.entry}
        canEdit={canEdit}
      />
    )
  } else if (tab === 'naming') {
    const rules = await guardPage(() => listNamingRules(db, actor, workId))
    content = <NamingRules workId={workId} rules={rules} canEdit={canEdit} />
  } else if (tab === 'summaries') {
    const chapters = await guardPage(() => listChapters(db, actor, workId))
    content = (
      <section aria-labelledby="wiki-summaries-heading" className="wg-wiki-index">
        <h2 id="wiki-summaries-heading" className="wg-wiki-section-title">
          회차 요약
        </h2>
        <ChapterSummaries chapters={chapters} canEdit={canEdit} />
      </section>
    )
  } else if (tab === 'requests') {
    const [directives, characters, cards, inferred] = await Promise.all([
      guardPage(() => listDirectives(db, actor, workId)),
      guardPage(() => listEntries(db, actor, workId, { kinds: ['character'] })),
      guardPage(() => listStyleCards(db, actor, workId)),
      guardPage(() => listInferredProposals(db, actor, workId)),
    ])
    content = (
      <DirectiveList
        workId={workId}
        directives={directives}
        characters={characters.map((c) => ({
          id: c.id,
          name: c.name,
          speech: c.fields.speech?.trim() || null,
        }))}
        styleCards={cards.map((card) => ({ name: card.name, rules: card.rules }))}
        canEdit={canEdit}
        inferred={inferred}
      />
    )
  } else {
    const [cards, characters] = await Promise.all([
      guardPage(() => listStyleCards(db, actor, workId)),
      guardPage(() => listEntries(db, actor, workId, { kinds: ['character'] })),
    ])
    content = (
      <StyleCards
        workId={workId}
        cards={cards}
        characters={characters.map((c) => ({ id: c.id, name: c.name }))}
        canEdit={canEdit}
        canSuggest={canEdit && !user.isAnonymous}
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SettingsBoardHeader workId={workId} active={tab} />
      {content}
    </div>
  )
}
