'use client'

import { ArrowLeftIcon, RotateCcwIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { PageHeader } from '@/components/app/page-header'
import { Disclosure, Sheet } from '@/components/motion'
import { Button, buttonVariants } from '@/components/ui/button'
import { ENTRY_KINDS } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import {
  CHARACTER_FIELD_LABELS,
  ENTRY_KIND_LABEL,
  PLACE_FIELD_LABELS,
  stripEpisodePrefix,
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
  entryNumber: number
  canEdit: boolean
  chapters: FactChapterOption[]
  changes: EntryHistoryItem[]
}

const FIELD_LABELS: Partial<Record<string, Record<string, string>>> = {
  character: CHARACTER_FIELD_LABELS,
  place: PLACE_FIELD_LABELS,
}

/** Card detail: summary, fields, description, facts, relations, appearances, threads and history. */
export function EntryDetail({
  workId,
  entry,
  entryNumber,
  canEdit,
  chapters,
  changes,
}: EntryDetailProps) {
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
    <div className="flex min-w-0 flex-col gap-4">
      <Link
        href={`/works/${workId}/wiki?tab=${backTab}&entry=${entry.id}`}
        className={buttonVariants({ variant: 'link', size: 'sm', className: 'w-fit px-0' })}
      >
        <ArrowLeftIcon strokeWidth={1.5} />
        설정 보드로
      </Link>

      <PageHeader
        title={entry.name}
        description={description}
        actions={
          canEdit && (
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
                    contextTier: entry.contextTier,
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
          )
        }
      />

      <Sheet
        page={entryNumber > 0 ? String(entryNumber).padStart(2, '0') : undefined}
        className="wg-wiki-detail"
      >
        {archived && (
          <p className="b-rule-top py-3 text-sm">
            보관된 카드예요. 복원해야 설정 보드에 다시 보여요.
          </p>
        )}

        <Disclosure title="요약" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content wrap-anywhere">
            <p className="b-manuscript whitespace-pre-wrap">{entry.summary || '요약이 없어요.'}</p>
          </div>
        </Disclosure>

        {fieldRows.length > 0 && (
          <Disclosure title="기본 정보" defaultOpen className="wg-wiki-detail-section">
            <div className="wg-wiki-detail-content wrap-anywhere">
              <dl>
                {fieldRows.map(([label, value], index) => (
                  <div key={`${label}-${index}`} className="wg-wiki-field">
                    <dt className="b-label b-muted">{label}</dt>
                    <dd className="whitespace-pre-line">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Disclosure>
        )}

        {entry.body && (
          <Disclosure title="설명" defaultOpen className="wg-wiki-detail-section">
            <div className="wg-wiki-detail-content wrap-anywhere">
              <p className="b-manuscript whitespace-pre-wrap">{entry.body}</p>
            </div>
          </Disclosure>
        )}

        <Disclosure title="사실" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content">
            <FactList
              workId={workId}
              entryId={entry.id}
              facts={entry.facts}
              chapters={chapters}
              canEdit={writable}
              hideHeading
            />
          </div>
        </Disclosure>

        <Disclosure title="관계" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content wrap-anywhere">
            {entry.relations.length === 0 ? (
              <p className="b-muted text-sm">관계가 없어요.</p>
            ) : (
              <ul className="wg-wiki-detail-list text-sm">
                {entry.relations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/works/${workId}/wiki/entries/${r.otherEntryId}`}
                      className="b-link"
                    >
                      {r.otherName || '이름 없음'}
                    </Link>
                    <span className="b-muted">
                      {!r.directed ? '↔' : r.direction === 'out' ? '→' : '←'} {r.kind}
                    </span>
                    {r.description && <span className="b-muted">{r.description}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Disclosure>

        <Disclosure title="등장 회차" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content wrap-anywhere">
            {entry.appearances.length === 0 ? (
              <p className="b-muted text-sm">등장 회차가 없어요.</p>
            ) : (
              <ul className="wg-wiki-detail-list text-sm">
                {entry.appearances.map((a) => {
                  const title = stripEpisodePrefix(a.title, a.position)
                  return (
                    <li key={a.chapterId}>
                      <Link href={`/works/${workId}/chapters/${a.chapterId}`} className="b-link">
                        <span className="font-mono">{a.position}화</span>
                        {title && (
                          <>
                            {' '}
                            <span className="font-heading">{title}</span>
                          </>
                        )}
                      </Link>
                      <span className="b-muted">
                        {' · 언급 '}
                        <span className="font-mono">{a.mentionCount}</span>회
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Disclosure>

        <Disclosure title="연결된 떡밥" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content wrap-anywhere">
            {entry.threads.length === 0 ? (
              <p className="b-muted text-sm">연결된 떡밥이 없어요.</p>
            ) : (
              <ul className="wg-wiki-detail-list text-sm">
                {entry.threads.map((t) => (
                  <li key={t.id}>
                    <Link href={`/works/${workId}/wiki/threads`} className="b-link">
                      {t.title}
                    </Link>
                    <span className="b-muted"> · {THREAD_STATUS_LABEL[t.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Disclosure>

        <Disclosure title="이 카드의 변경 이력" defaultOpen className="wg-wiki-detail-section">
          <div className="wg-wiki-detail-content wrap-anywhere">
            <EntryHistory changes={changes} />
          </div>
        </Disclosure>
      </Sheet>
    </div>
  )
}

function ArchiveEntryButton({ entryId, onArchived }: { entryId: string; onArchived: () => void }) {
  return (
    <ConfirmButton
      title="이 카드를 보관할까요?"
      description="보관한 카드는 설정 보드에서 빠져요. 이력에서 되돌릴 수 있어요."
      confirmLabel="보관"
      onConfirm={async () => {
        const saved = await runAction(archiveEntryAction({ entryId }), {
          success: '카드를 보관했어요.',
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
          success: '카드를 복원했어요.',
        })
        setPending(false)
        if (saved) router.refresh()
      }}
    >
      <RotateCcwIcon strokeWidth={1.5} />
      복원
    </Button>
  )
}
