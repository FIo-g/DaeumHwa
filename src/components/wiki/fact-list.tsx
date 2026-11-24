'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { FactStatusBadge } from '@/components/app/fact-status-badge'
import { SourceLabel } from '@/components/app/source-label'
import { runAction } from '@/lib/client/run-action'
import { stripEpisodePrefix } from '@/lib/labels'
import { archiveFactAction } from '@/server/actions/wiki'
import type { FactView } from '@/server/facts'
import { FactFormDialog, FactTagDialog, type FactChapterOption } from './fact-form'
import { FactValidity } from './fact-validity'
import { SupersedeDialog } from './supersede-dialog'

type FactListProps = {
  workId: string
  entryId: string
  facts: FactView[]
  chapters: FactChapterOption[]
  canEdit: boolean
  hideHeading?: boolean
}

/** Facts of one card with tags, validity ranges, sources and the edit menu for editors. */
export function FactList({
  workId,
  entryId,
  facts,
  chapters,
  canEdit,
  hideHeading = false,
}: FactListProps) {
  return (
    <section aria-labelledby="entry-facts-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="entry-facts-heading" className={hideHeading ? 'sr-only' : 'b-subhead'}>
          사실
        </h2>
        {canEdit && (
          <FactFormDialog
            workId={workId}
            mode="create"
            entryId={entryId}
            chapters={chapters}
            triggerLabel="사실 추가"
          />
        )}
      </div>
      {facts.length === 0 ? (
        <EmptyState title="아직 사실이 없어요." />
      ) : (
        <ul className="wg-wiki-fact-list">
          {facts.map((fact, index) => (
            <FactItem
              key={fact.id}
              number={index + 1}
              workId={workId}
              fact={fact}
              chapters={chapters}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function FactItem({
  number,
  workId,
  fact,
  chapters,
  canEdit,
}: {
  number: number
  workId: string
  fact: FactView
  chapters: FactChapterOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const superseded = fact.supersededBy !== null
  const active = !superseded && !fact.archivedAt
  const chapter = fact.sourceType === 'chapter' ? fact.sourceChapter : null
  const sourceTitle = chapter ? stripEpisodePrefix(chapter.title, chapter.position) : ''

  return (
    <li id={`fact-${fact.id}`} data-status={fact.status} className="wg-wiki-fact-row">
      <div className="wg-wiki-fact-meta">
        <span className="wg-wiki-line-number" aria-hidden="true">
          {String(number).padStart(2, '0')}
        </span>
        <FactStatusBadge status={fact.status} />
        {chapter ? (
          <Link
            href={`/works/${workId}/chapters/${chapter.id}`}
            className="wg-shell-source wg-shell-source-link"
          >
            <span className="font-mono">{chapter.position}화</span>
            {sourceTitle && (
              <>
                {' '}
                <span className="font-heading">{sourceTitle}</span>
              </>
            )}
          </Link>
        ) : (
          <SourceLabel workId={workId} sourceType={fact.sourceType} chapter={fact.sourceChapter} />
        )}
      </div>
      <blockquote
        key={JSON.stringify([
          fact.content,
          fact.status,
          fact.validFromPosition,
          fact.validToPosition,
          fact.sourceChapterId,
          fact.evidence,
        ])}
        className="wg-wiki-fact-text wg-wiki-fact-write"
      >
        {superseded ? <del>{fact.content}</del> : fact.content}
      </blockquote>
      {(fact.validFromPosition !== null || fact.validToPosition !== null || fact.supersededBy) && (
        <div className="b-muted flex flex-wrap items-center gap-2 text-xs">
          <FactValidity from={fact.validFromPosition} to={fact.validToPosition} />
          {fact.supersededBy && (
            <span className="flex flex-wrap items-center gap-1">
              <span>
                (<span className="font-mono">{fact.supersededBy.validFromPosition}화</span>부터
                바뀜)
              </span>
              <a href={`#fact-${fact.supersededBy.id}`} className="b-link">
                새 사실 보기
              </a>
            </span>
          )}
        </div>
      )}
      {fact.evidence && (
        <blockquote className="b-rule-top b-muted pt-2 font-heading text-sm leading-relaxed wrap-anywhere">
          {fact.evidence}
        </blockquote>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {active && (
            <>
              <FactFormDialog
                workId={workId}
                mode="edit"
                chapters={chapters}
                fact={{
                  id: fact.id,
                  content: fact.content,
                  status: fact.status,
                  sourceChapterId: fact.sourceChapterId,
                  evidence: fact.evidence,
                  revealAtPosition: fact.revealAtPosition,
                  validFromPosition: fact.validFromPosition,
                  validToPosition: fact.validToPosition,
                }}
                triggerLabel="내용 수정"
                triggerVariant="ghost"
              />
              <FactTagDialog factId={fact.id} status={fact.status} />
              <SupersedeDialog
                fact={{ id: fact.id, content: fact.content, status: fact.status }}
                chapters={chapters}
              />
            </>
          )}
          <ConfirmButton
            title="이 사실을 보관할까요?"
            description="보관한 사실은 목록에서 빠져요. 이력에서 되돌릴 수 있어요."
            confirmLabel="보관"
            variant="ghost"
            onConfirm={async () => {
              const saved = await runAction(archiveFactAction({ factId: fact.id }), {
                success: '사실을 보관했어요.',
              })
              if (saved) router.refresh()
            }}
          >
            보관
          </ConfirmButton>
        </div>
      )}
    </li>
  )
}
