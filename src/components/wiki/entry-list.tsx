'use client'

import Link from 'next/link'
import { useId, useRef, useState, type CSSProperties } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { FactStatusBadge } from '@/components/app/fact-status-badge'
import { Disclosure, MenuSheet } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EntryKind, FactStatus } from '@/db/types'
import { ENTRY_KIND_LABEL, factValidityText } from '@/lib/labels'
import { EntryFormDialog } from './entry-form'

type FactPreview = {
  id: string
  content: string
  status: FactStatus
  validFromPosition: number | null
  validToPosition: number | null
}

export type EntryListItem = {
  id: string
  kind: EntryKind
  name: string
  aliases: string[]
  summary: string
  factCount: number
  facts: FactPreview[]
  firstAppearance: number | null
}

type EntryListProps = {
  workId: string
  tab: string
  entries: EntryListItem[]
  kinds: EntryKind[]
  defaultKind: EntryKind
  filterKinds?: EntryKind[]
  kindFilter: EntryKind | null
  query: string
  initialEntryId?: string
  canEdit: boolean
}

type SortOrder = 'name' | 'appearance'
const SORT_OPTIONS = [
  { value: 'name', label: '이름순' },
  { value: 'appearance', label: '등장 회차순' },
] as const

function normalizeSearch(text: string) {
  return text.toLowerCase().replace(/\s+/g, '')
}

function LookupControls({
  action,
  tab,
  kindFilter,
  value,
  onSearch,
  order,
  onSort,
}: {
  action: string
  tab: string
  kindFilter: EntryKind | null
  value: string
  onSearch: (value: string) => void
  order: SortOrder
  onSort: (order: SortOrder) => void
}) {
  const composing = useRef(false)
  const sortName = useId()
  const [composition, setComposition] = useState<string | null>(null)
  return (
    <>
      <form
        method="get"
        action={action}
        role="search"
        className="flex min-w-0 items-center gap-2"
        onSubmit={(event) => {
          if (composing.current) event.preventDefault()
        }}
      >
        <input type="hidden" name="tab" value={tab} />
        {kindFilter && <input type="hidden" name="kind" value={kindFilter} />}
        <Input
          name="q"
          type="search"
          aria-label="이름, 별칭, 요약 검색"
          placeholder="이름, 별칭, 요약 검색"
          value={composition ?? value}
          onCompositionStart={(event) => {
            composing.current = true
            setComposition(event.currentTarget.value)
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            setComposition(null)
            onSearch(event.currentTarget.value)
          }}
          onChange={(event) => {
            if (composing.current) setComposition(event.currentTarget.value)
            else onSearch(event.currentTarget.value)
          }}
        />
        <Button type="submit" variant="outline">
          검색
        </Button>
      </form>
      <fieldset className="wg-wiki-sort">
        <legend className="sr-only">정렬</legend>
        {SORT_OPTIONS.map(({ value, label }) => (
          <label key={value} className="wg-wiki-cell">
            <input
              type="radio"
              name={sortName}
              checked={order === value}
              onChange={() => onSort(value)}
              className="sr-only"
            />
            <span>{label}</span>
            <span aria-hidden="true" className="wg-wiki-cell-fill" data-label={label} />
          </label>
        ))}
      </fieldset>
    </>
  )
}

export function EntryList({
  workId,
  tab,
  entries,
  kinds,
  defaultKind,
  filterKinds,
  kindFilter,
  query,
  initialEntryId,
  canEdit,
}: EntryListProps) {
  const isCharacters = tab === 'characters'
  const base = `/works/${workId}/wiki`
  const [search, setSearch] = useState(query)
  const [sort, setSort] = useState<{ order: SortOrder; changed: boolean }>({
    order: 'name',
    changed: false,
  })
  const { order } = sort
  const [selection, setSelection] = useState<{ id: string; open: boolean } | null>(
    initialEntryId ? { id: initialEntryId, open: true } : null,
  )
  const term = normalizeSearch(search)
  const visible = entries
    .map((entry, index) => ({ entry, number: index + 1 }))
    .filter(
      ({ entry }) =>
        !term ||
        [entry.name, ...entry.aliases, entry.summary].some((text) =>
          normalizeSearch(text).includes(term),
        ),
    )
    .sort(({ entry: a }, { entry: b }) => {
      if (order === 'appearance' && a.firstAppearance !== b.firstAppearance) {
        return (a.firstAppearance ?? Infinity) - (b.firstAppearance ?? Infinity)
      }
      return a.name.localeCompare(b.name, 'ko')
    })
  const selected = visible.find(({ entry }) => entry.id === selection?.id)
  const queryHref = (kind: EntryKind | null, value = search) => {
    const params = new URLSearchParams({ tab })
    if (kind) params.set('kind', kind)
    if (value.trim()) params.set('q', value.trim())
    return `${base}?${params}`
  }
  const lookupProps = {
    action: base,
    tab,
    kindFilter,
    value: search,
    onSearch: setSearch,
    order,
    onSort: (order: SortOrder) => setSort({ order, changed: true }),
  }

  return (
    <section aria-labelledby="wiki-index-heading" className="wg-wiki-index">
      <div className="wg-wiki-search-dock">
        <div className="wg-wiki-toolbar">
          <h2 id="wiki-index-heading" className="wg-wiki-section-title">
            {isCharacters ? '인물 색인' : '세계관 색인'}
          </h2>
          <div className="wg-wiki-search-inline">
            <LookupControls {...lookupProps} />
          </div>
          <div className="wg-wiki-search-sheet">
            <MenuSheet
              title="검색·정렬"
              label="검색·정렬"
              triggerText="검색·정렬"
              footer={search && <p className="b-label pt-3">검색어&nbsp; {search}</p>}
            >
              <LookupControls {...lookupProps} />
            </MenuSheet>
          </div>
          {canEdit && (
            <EntryFormDialog
              workId={workId}
              mode="create"
              kinds={kinds}
              defaultKind={defaultKind}
              triggerLabel={isCharacters ? '새 인물' : '새 항목'}
            />
          )}
        </div>
        {filterKinds && (
          <nav className="wg-wiki-filters" aria-label="분류 필터">
            {[null, ...filterKinds].map((kind) => (
              <Link
                key={kind ?? 'all'}
                href={queryHref(kind)}
                aria-current={kind === kindFilter ? 'page' : undefined}
                className="wg-wiki-cell"
              >
                {kind ? ENTRY_KIND_LABEL[kind] : '전체'}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            term
              ? '검색 결과가 없어요.'
              : isCharacters
                ? '아직 인물이 없어요.'
                : '아직 항목이 없어요.'
          }
          description={term ? '다른 이름이나 별칭으로 찾아 보세요.' : '만든 카드가 여기 모여요.'}
          action={
            term && (
              <Link
                href={queryHref(kindFilter, '')}
                className="b-link"
                onClick={() => setSearch('')}
              >
                검색 지우기
              </Link>
            )
          }
        />
      ) : (
        <ol key={order} className="wg-wiki-index-list" role="list" data-sorted={sort.changed}>
          {visible.map(({ entry, number }, index) => {
            const selectedEntry = selected?.entry.id === entry.id
            const expanded = selectedEntry && Boolean(selection?.open)
            const detailHref = `${base}/entries/${entry.id}`
            return (
              <li
                key={entry.id}
                role="listitem"
                className="wg-wiki-index-item"
                style={{ '--wg-wiki-row': Math.min(index, 3) } as CSSProperties}
              >
                <div className="wg-wiki-index-row">
                  <span className="wg-wiki-index-number" aria-hidden="true">
                    {String(number).padStart(2, '0')}
                  </span>
                  <div className="wg-wiki-index-content">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link className="b-link wg-wiki-name" href={detailHref}>
                        {entry.name}
                      </Link>
                      <span className="wg-wiki-kind">{ENTRY_KIND_LABEL[entry.kind]}</span>
                    </div>
                    {entry.aliases.length > 0 && (
                      <span className="b-label b-muted">{entry.aliases.join(' · ')}</span>
                    )}
                    {entry.summary && <p className="text-sm">{entry.summary}</p>}
                    <span className="b-label b-muted font-mono">사실 {entry.factCount}개</span>
                  </div>
                </div>
                <Disclosure
                  title={<span className="sr-only">{entry.name} 미리 보기</span>}
                  open={expanded}
                  onOpenChange={(open) => setSelection({ id: entry.id, open })}
                  className="wg-wiki-index-disclosure"
                >
                  {selectedEntry && <EntryPreview entry={entry} detailHref={detailHref} />}
                </Disclosure>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function EntryPreview({ entry, detailHref }: { entry: EntryListItem; detailHref: string }) {
  return (
    <div className="wg-wiki-preview">
      <p className="wg-wiki-kind">{ENTRY_KIND_LABEL[entry.kind]}</p>
      <h3 className="wg-wiki-name">{entry.name}</h3>
      <p className="text-sm">{entry.summary || '요약이 없어요.'}</p>
      <h4 className="text-sm font-medium">사실</h4>
      {entry.facts.length ? (
        <ul>
          {entry.facts.map((fact, index) => (
            <li
              key={fact.id}
              className="wg-wiki-preview-fact"
              style={{ '--wg-wiki-row': Math.min(index, 3) } as CSSProperties}
            >
              <blockquote className="wg-wiki-fact-text">{fact.content}</blockquote>
              <div className="b-label b-muted flex flex-wrap items-center gap-2">
                <FactStatusBadge status={fact.status} />
                <span className="font-mono">
                  {factValidityText(fact.validFromPosition, fact.validToPosition)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="b-muted b-label">아직 사실이 없어요.</p>
      )}
      <p className="b-label b-muted font-mono">
        {entry.firstAppearance === null
          ? '등장 회차가 없어요.'
          : `${entry.firstAppearance}화에 처음 등장`}
      </p>
      <Link href={detailHref} className="b-link w-fit text-sm">
        카드 열기
      </Link>
    </div>
  )
}
