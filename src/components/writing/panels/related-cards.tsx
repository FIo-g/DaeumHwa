'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { getTextWorker } from '@/lib/client/worker-client'
import type { Mention } from '@/lib/korean/mentions'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { cn } from '@/lib/utils'

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
        title="아직 위키 카드가 없습니다."
        description="인물과 장소를 카드로 만들면 원고에 나올 때 여기에 보입니다."
        action={
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={`/works/${data.workId}/wiki`}
          >
            위키 열기
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label="관련 카드" className="grid gap-3">
      {cards.length === 0 && (
        <p className="text-sm text-muted-foreground">
          이 회차 원고에 나온 카드가 없습니다. 이름이 나오면 여기에 표시됩니다.
        </p>
      )}

      <ul className="grid gap-2">
        {cards.map(({ mention, entry }) => {
          const active = entry.id === selectedId
          return (
            <li key={entry.id}>
              <div
                className={cn(
                  'grid gap-1 rounded-lg border p-3',
                  active && 'border-primary bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(active ? null : entry.id)}
                    className="text-left font-medium underline-offset-4 hover:underline"
                  >
                    {entry.name}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">{mention.count}회</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ENTRY_KIND_LABEL[entry.kind]}</Badge>
                  <Link
                    href={`/works/${data.workId}/wiki/entries/${entry.id}`}
                    className="text-xs underline underline-offset-4"
                  >
                    카드 열기
                  </Link>
                </div>
                {entry.summary && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{entry.summary}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        위키 전체 {data.entries.length}개 중 {cards.length}개
      </p>
    </section>
  )
}
