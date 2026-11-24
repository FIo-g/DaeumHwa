'use client'

import Link from 'next/link'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { FactStatusBadge } from '@/components/app/fact-status-badge'
import { buttonVariants } from '@/components/ui/button'
import { getTextWorker } from '@/lib/client/worker-client'
import type { Mention } from '@/lib/korean/mentions'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { getCheckContextAction } from '@/server/actions/checks'
import type { CheckContextView } from '@/server/check-context'

const DEBOUNCE_MS = 1000

type RelatedCardsProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
}

/**
 * Wiki cards named in the manuscript. Mentions are found in the text worker, one second after the
 * last edit. Picking a card marks its mentions in the editor.
 */
export function RelatedCards({ data, api, text }: RelatedCardsProps) {
  const [mentions, setMentions] = useState<Mention[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [context, setContext] = useState<CheckContextView | null>(null)
  const chapterId = data.chapter.id
  const archived = data.chapter.archivedAt !== null

  const targets = useMemo(
    () => data.entries.map((entry) => ({ id: entry.id, names: [entry.name, ...entry.aliases] })),
    [data.entries],
  )

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      getTextWorker()
        .findMentions(text, targets)
        .then((found) => {
          if (!cancelled) setMentions(found)
        })
        .catch(() => {})
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, targets])

  const cards = useMemo(
    () =>
      mentions.flatMap((mention) => {
        const entry = data.entries.find((e) => e.id === mention.entryId)
        return entry ? [{ mention, entry }] : []
      }),
    [mentions, data.entries],
  )

  const hasCards = cards.length > 0
  useEffect(() => {
    if (!hasCards || archived) return
    let cancelled = false
    void getCheckContextAction({ chapterId })
      .then((result) => {
        if (!cancelled && result.ok) setContext(result.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [archived, chapterId, data.entries, hasCards])

  const selected = cards.find((card) => card.entry.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) {
      api.setHighlights('search', [])
      return
    }
    const names = [selected.entry.name, ...selected.entry.aliases]
      .filter((name) => name.length > 0)
      .sort((a, b) => b.length - a.length)
    const highlights: Highlight[] = []
    selected.mention.positions.forEach((pos, index) => {
      const name = names.find((n) => text.startsWith(n, pos))
      if (!name) return
      highlights.push({
        id: `search-${index}`,
        start: pos,
        end: pos + name.length,
        kind: 'search',
      })
    })
    api.setHighlights('search', highlights)
  }, [api, selected, text])

  useEffect(() => {
    return () => api.setHighlights('search', [])
  }, [api])

  if (data.entries.length === 0) {
    return (
      <EmptyState
        title="아직 카드가 없어요."
        description="설정 보드에서 인물이나 장소 카드를 추가해 보세요."
        action={
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={`/works/${data.workId}/wiki`}
          >
            설정 보드 열기
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label="관련 카드" className="wg-panels-section">
      <h2 className="wg-panels-heading">관련 카드</h2>
      {cards.length === 0 && (
        <p className="text-sm text-muted-foreground">이 회차 원고에 이름이 나온 카드가 없어요.</p>
      )}

      <ul className="wg-panels-list">
        {cards.map(({ mention, entry }, index) => {
          const active = entry.id === selectedId
          const facts = context?.entries.find((item) => item.id === entry.id)?.facts ?? []
          const statuses = [...new Set(facts.map((fact) => fact.status))]
          return (
            <li
              key={entry.id}
              className="wg-panels-row wg-panels-related"
              style={{ '--wg-panels-row': Math.min(index, 3) } as CSSProperties}
            >
              <div className="wg-panels-related-meta">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-controls={`related-facts-${entry.id}`}
                  onClick={() => setSelectedId(active ? null : entry.id)}
                  className="b-link wg-panels-related-title"
                >
                  {entry.name}
                </button>
                <span className="wg-panels-kind">{ENTRY_KIND_LABEL[entry.kind]}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                  {mention.count}회
                </span>
              </div>
              {entry.summary && <p className="text-sm text-muted-foreground">{entry.summary}</p>}
              <div className="wg-panels-related-meta">
                {statuses.map((status) => (
                  <FactStatusBadge key={status} status={status} />
                ))}
                <Link
                  href={`/works/${data.workId}/wiki/entries/${entry.id}`}
                  className="b-link ml-auto text-xs"
                >
                  카드 열기
                </Link>
              </div>
              <div id={`related-facts-${entry.id}`} hidden={!active}>
                {active && facts.length > 0 && (
                  <ul className="wg-panels-list">
                    {facts.map((fact, factIndex) => (
                      <li
                        key={fact.id}
                        className="wg-panels-fact"
                        style={{ '--wg-panels-row': Math.min(factIndex, 3) } as CSSProperties}
                      >
                        <blockquote className="wg-panels-wiki-text">{fact.content}</blockquote>
                        <FactStatusBadge status={fact.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        전체 카드 {data.entries.length}개 중 {cards.length}개
      </p>
    </section>
  )
}
