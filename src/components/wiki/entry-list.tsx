import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { buttonVariants, Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EntryKind } from '@/db/types'
import { ENTRY_KIND_LABEL } from '@/lib/labels'
import { EntryFormDialog } from './entry-form'

export type EntryListItem = {
  id: string
  kind: EntryKind
  name: string
  aliases: string[]
  summary: string
  factCount: number
}

type EntryListProps = {
  workId: string
  tab: string
  entries: EntryListItem[]
  /** Kinds the create dialog offers on this tab. */
  kinds: EntryKind[]
  defaultKind: EntryKind
  /** When given, shows kind filter chips (world tab). */
  filterKinds?: EntryKind[]
  kindFilter: EntryKind | null
  query: string
  canEdit: boolean
}

/** Search box, kind filter, and the card grid of the characters or world tab. */
export function EntryList({
  workId,
  tab,
  entries,
  kinds,
  defaultKind,
  filterKinds,
  kindFilter,
  query,
  canEdit,
}: EntryListProps) {
  const isCharacters = tab === 'characters'
  const base = `/works/${workId}/wiki`
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" action={base} role="search" className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          {kindFilter && <input type="hidden" name="kind" value={kindFilter} />}
          <Input
            name="q"
            aria-label="이름, 별칭, 요약 검색"
            placeholder="이름, 별칭, 요약 검색"
            defaultValue={query}
            className="w-56"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
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
        <div className="flex flex-wrap gap-2" aria-label="분류 필터">
          <Link
            href={`${base}?tab=${tab}`}
            aria-current={kindFilter === null ? 'page' : undefined}
            className={buttonVariants({
              variant: kindFilter === null ? 'secondary' : 'ghost',
              size: 'sm',
            })}
          >
            전체
          </Link>
          {filterKinds.map((kind) => (
            <Link
              key={kind}
              href={`${base}?tab=${tab}&kind=${kind}`}
              aria-current={kindFilter === kind ? 'page' : undefined}
              className={buttonVariants({
                variant: kindFilter === kind ? 'secondary' : 'ghost',
                size: 'sm',
              })}
            >
              {ENTRY_KIND_LABEL[kind]}
            </Link>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title={isCharacters ? '아직 인물이 없습니다.' : '아직 항목이 없습니다.'}
          description={query ? '검색 결과가 없습니다.' : '카드를 만들면 여기에 모여 보입니다.'}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`${base}/entries/${entry.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.name}</span>
                  <Badge variant="secondary">{ENTRY_KIND_LABEL[entry.kind]}</Badge>
                </span>
                {entry.aliases.length > 0 && (
                  <span className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {entry.aliases.map((alias) => (
                      <span key={alias}>{alias}</span>
                    ))}
                  </span>
                )}
                {entry.summary && <span className="line-clamp-2 text-sm">{entry.summary}</span>}
                <span className="mt-auto text-xs text-muted-foreground">
                  사실 {entry.factCount}개
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
