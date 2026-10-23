import type { ReactNode } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { ChapterSummaries } from '@/components/wiki/chapter-summaries'
import { DirectiveList } from '@/components/wiki/directive-list'
import { EntryList, type EntryListItem } from '@/components/wiki/entry-list'
import { NamingRules } from '@/components/wiki/naming-rules'
import { StyleCards } from '@/components/wiki/style-cards'
import { WikiTabs } from '@/components/wiki/wiki-tabs'
import { ENTRY_KINDS, type EntryKind } from '@/db/types'
import { hasRole } from '@/server/access'
import { listChapters } from '@/server/chapters'
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
  searchParams: Promise<{ tab?: string; kind?: string; q?: string }>
}) {
  const { workId } = await params
  const sp = await searchParams
  const { db, actor } = await pageContext(`/works/${workId}/wiki`)
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
    const [entries, facts] = await Promise.all([
      guardPage(() => listEntries(db, actor, workId, { kinds: listKinds, query })),
      guardPage(() => listFacts(db, actor, workId)),
    ])
    const counts = new Map<string, number>()
    for (const fact of facts) {
      if (fact.entryId) counts.set(fact.entryId, (counts.get(fact.entryId) ?? 0) + 1)
    }
    const items: EntryListItem[] = entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      summary: e.summary,
      factCount: counts.get(e.id) ?? 0,
    }))
    content = (
      <EntryList
        workId={workId}
        tab={tab}
        entries={items}
        kinds={tab === 'characters' ? ['character'] : WORLD_KINDS}
        defaultKind={tab === 'characters' ? 'character' : 'place'}
        filterKinds={tab === 'world' ? WORLD_KINDS : undefined}
        kindFilter={kindFilter}
        query={query}
        canEdit={canEdit}
      />
    )
  } else if (tab === 'naming') {
    const rules = await guardPage(() => listNamingRules(db, actor, workId))
    content = <NamingRules workId={workId} rules={rules} canEdit={canEdit} />
  } else if (tab === 'summaries') {
    const chapters = await guardPage(() => listChapters(db, actor, workId))
    content = <ChapterSummaries chapters={chapters} canEdit={canEdit} />
  } else if (tab === 'requests') {
    const [directives, characters, cards] = await Promise.all([
      guardPage(() => listDirectives(db, actor, workId)),
      guardPage(() => listEntries(db, actor, workId, { kinds: ['character'] })),
      guardPage(() => listStyleCards(db, actor, workId)),
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
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="설정 보드"
        description="인물, 세계관, 표기, 회차 요약, 문체 카드를 한곳에서 관리합니다."
      />
      <WikiTabs workId={workId} active={tab} />
      {content}
    </div>
  )
}
