'use client'

import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { FactStatusBadge } from '@/components/app/fact-status-badge'
import { SourceLabel } from '@/components/app/source-label'
import { runAction } from '@/lib/client/run-action'
import { cn } from '@/lib/utils'
import { archiveFactAction } from '@/server/actions/wiki'
import type { FactView } from '@/server/facts'
import { FactFormDialog, FactTagDialog, type FactChapterOption } from './fact-form'
import { SupersedeDialog } from './supersede-dialog'

type FactListProps = {
  workId: string
  entryId: string
  facts: FactView[]
  chapters: FactChapterOption[]
  canEdit: boolean
}

/** Facts of one card with tags, validity ranges, sources and the edit menu for editors. */
export function FactList({ workId, entryId, facts, chapters, canEdit }: FactListProps) {
  return (
    <section aria-labelledby="entry-facts-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="entry-facts-heading" className="text-base font-semibold">
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
        <EmptyState title="아직 사실이 없습니다." />
      ) : (
        <ul className="flex flex-col gap-2">
          {facts.map((fact) => (
            <FactItem
              key={fact.id}
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

function validityText(fact: FactView): string | null {
  const from = fact.validFromPosition
  const to = fact.validToPosition
  if (from !== null && to !== null) return `${from}화부터 ~${to}화`
  if (from !== null) return `${from}화부터`
  if (to !== null) return `~${to}화`
  return null
}

function FactItem({
  workId,
  fact,
  chapters,
  canEdit,
}: {
  workId: string
  fact: FactView
  chapters: FactChapterOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const superseded = fact.supersededBy !== null
  const active = !superseded && !fact.archivedAt
  const validity = validityText(fact)

  return (
    <li
      id={`fact-${fact.id}`}
      className={cn('flex flex-col gap-2 rounded-lg border p-3', superseded && 'opacity-60')}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FactStatusBadge status={fact.status} />
        {validity && <span className="text-muted-foreground">{validity}</span>}
        {fact.supersededBy && (
          <span className="flex flex-wrap items-center gap-1 text-muted-foreground">
            <span>({fact.supersededBy.validFromPosition}화부터 바뀜)</span>
            <a href={`#fact-${fact.supersededBy.id}`} className="underline underline-offset-4">
              새 사실 보기
            </a>
          </span>
        )}
      </div>
      <p className="text-sm">{fact.content}</p>
      <div className="text-xs text-muted-foreground">
        <SourceLabel workId={workId} sourceType={fact.sourceType} chapter={fact.sourceChapter} />
      </div>
      {fact.evidence && (
        <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
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
                }}
                triggerLabel="내용 수정"
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
            description="보관한 사실은 목록에서 빠집니다. 이력에서 되돌릴 수 있습니다."
            confirmLabel="보관"
            onConfirm={async () => {
              const saved = await runAction(archiveFactAction({ factId: fact.id }), {
                success: '사실을 보관했습니다.',
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
