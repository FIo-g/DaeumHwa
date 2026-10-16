'use client'

import { ArrowLeftIcon, RotateCcwIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { PageHeader } from '@/components/app/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { ENTRY_KINDS } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import {
  CHARACTER_FIELD_LABELS,
  chapterLabel,
  ENTRY_KIND_LABEL,
  PLACE_FIELD_LABELS,
  THREAD_STATUS_LABEL,
} from '@/lib/labels'
import { archiveEntryAction, restoreEntryAction } from '@/server/actions/wiki'
import type { EntryDetail as EntryDetailData } from '@/server/wiki'
import { type EntryHistoryItem, EntryHistory } from './entry-history'
import { EntryFormDialog } from './entry-form'
import { FactList } from './fact-list'
import type { FactChapterOption } from './fact-form'

type EntryDetailProps = {
  workId: string
  entry: EntryDetailData
  canEdit: boolean
  chapters: FactChapterOption[]
  changes: EntryHistoryItem[]
}

const FIELD_LABELS: Partial<Record<string, Record<string, string>>> = {
  character: CHARACTER_FIELD_LABELS,
  place: PLACE_FIELD_LABELS,
}

/** Card detail: summary, fields, description, facts, relations, appearances, threads and history. */
export function EntryDetail({ workId, entry, canEdit, chapters, changes }: EntryDetailProps) {
  const router = useRouter()
  const archived = entry.archivedAt !== null
  const writable = canEdit && !archived
  const labels = FIELD_LABELS[entry.kind] ?? {}
  const fieldRows: [string, string][] = [
    ...Object.entries(labels)
      .map(([key, label]) => [label, entry.fields[key] ?? ''] as [string, string])
      .filter(([, value]) => value !== ''),
    ...entry.customFields
      .filter((c) => c.key !== '' && c.value !== '')
      .map((c) => [c.key, c.value] as [string, string]),
  ]
  const description = [
    ENTRY_KIND_LABEL[entry.kind],
    entry.aliases.length > 0 ? `별칭 ${entry.aliases.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const backTab = entry.kind === 'character' ? 'characters' : 'world'

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`/works/${workId}/wiki?tab=${backTab}`}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-fit' })}
      >
        <ArrowLeftIcon />
        설정 보드로
      </Link>

      <PageHeader
        title={entry.name}
        description={description}
        actions={
          canEdit ? (
            <>
              {!archived && (
                <EntryFormDialog
                  workId={workId}
                  mode="edit"
                  kinds={[...ENTRY_KINDS]}
                  defaultKind={entry.kind}
                  entry={{
                    id: entry.id,
                    kind: entry.kind,
                    name: entry.name,
                    aliases: entry.aliases,
                    summary: entry.summary,
                    body: entry.body,
                    fields: entry.fields,
                    customFields: entry.customFields,
                  }}
                  triggerLabel="수정"
                />
              )}
              {archived ? (
                <RestoreEntryButton entryId={entry.id} />
              ) : (
                <ArchiveEntryButton
                  entryId={entry.id}
                  onArchived={() => router.push(`/works/${workId}/wiki?tab=${backTab}`)}
                />
              )}
            </>
          ) : undefined
        }
      />

      {archived && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          보관된 카드입니다. 복원하면 다시 설정 보드에 나타납니다.
        </p>
      )}

      <section aria-labelledby="entry-summary-heading" className="flex flex-col gap-2">
        <h2 id="entry-summary-heading" className="text-base font-semibold">
          요약
        </h2>
        <p className="text-sm">{entry.summary || '요약이 없습니다.'}</p>
      </section>

      {fieldRows.length > 0 && (
        <section aria-labelledby="entry-fields-heading" className="flex flex-col gap-2">
          <h2 id="entry-fields-heading" className="text-base font-semibold">
            고정 필드
          </h2>
          <dl className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            {fieldRows.map(([label, value], index) => (
              <Fragment key={`${label}-${index}`}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm whitespace-pre-line">{value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}

      {entry.body && (
        <section aria-labelledby="entry-body-heading" className="flex flex-col gap-2">
          <h2 id="entry-body-heading" className="text-base font-semibold">
            설명
          </h2>
          <p className="text-sm whitespace-pre-line">{entry.body}</p>
        </section>
      )}

      <FactList
        workId={workId}
        entryId={entry.id}
        facts={entry.facts}
        chapters={chapters}
        canEdit={writable}
      />

      <section aria-labelledby="entry-relations-heading" className="flex flex-col gap-2">
        <h2 id="entry-relations-heading" className="text-base font-semibold">
          관계
        </h2>
        {entry.relations.length === 0 ? (
          <p className="text-sm text-muted-foreground">관계가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {entry.relations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/works/${workId}/wiki/entries/${r.otherEntryId}`}
                  className="underline underline-offset-4"
                >
                  {r.otherName || '이름 없음'}
                </Link>
                <span className="text-muted-foreground">
                  {!r.directed ? '↔' : r.direction === 'out' ? '→' : '←'} {r.kind}
                </span>
                {r.description && <span className="text-muted-foreground">{r.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="entry-appearances-heading" className="flex flex-col gap-2">
        <h2 id="entry-appearances-heading" className="text-base font-semibold">
          등장 회차
        </h2>
        {entry.appearances.length === 0 ? (
          <p className="text-sm text-muted-foreground">등장 회차가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {entry.appearances.map((a) => (
              <li key={a.chapterId}>
                <Link
                  href={`/works/${workId}/chapters/${a.chapterId}`}
                  className="underline underline-offset-4"
                >
                  {chapterLabel(a.position, a.title)}
                </Link>
                <span className="text-muted-foreground"> · 언급 {a.mentionCount}회</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="entry-threads-heading" className="flex flex-col gap-2">
        <h2 id="entry-threads-heading" className="text-base font-semibold">
          연결된 떡밥
        </h2>
        {entry.threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">연결된 떡밥이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {entry.threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/works/${workId}/wiki/threads`}
                  className="underline underline-offset-4"
                >
                  {t.title}
                </Link>
                <span className="text-muted-foreground"> · {THREAD_STATUS_LABEL[t.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="entry-history-heading" className="flex flex-col gap-2">
        <h2 id="entry-history-heading" className="text-base font-semibold">
          이 카드의 변경 이력
        </h2>
        <EntryHistory changes={changes} />
      </section>
    </div>
  )
}

function ArchiveEntryButton({ entryId, onArchived }: { entryId: string; onArchived: () => void }) {
  return (
    <ConfirmButton
      title="이 카드를 보관할까요?"
      description="보관한 카드는 설정 보드에서 빠집니다. 이력에서 되돌릴 수 있습니다."
      confirmLabel="보관"
      onConfirm={async () => {
        const saved = await runAction(archiveEntryAction({ entryId }), {
          success: '카드를 보관했습니다.',
        })
        if (saved) onArchived()
      }}
    >
      보관
    </ConfirmButton>
  )
}

function RestoreEntryButton({ entryId }: { entryId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const saved = await runAction(restoreEntryAction({ entryId }), {
          success: '카드를 복원했습니다.',
        })
        setPending(false)
        if (saved) router.refresh()
      }}
    >
      <RotateCcwIcon />
      복원
    </Button>
  )
}
