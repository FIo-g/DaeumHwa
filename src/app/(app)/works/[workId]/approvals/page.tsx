import type { CSSProperties } from 'react'
import { FilterLinks, type FilterOption } from '@/components/history/filter-links'
import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import type { ProposalChapterOption } from '@/components/proposals/proposal-card'
import { ProposalDetails } from '@/components/proposals/proposal-details'
import { ProposalList } from '@/components/proposals/proposal-list'
import { chapterLabel, PROPOSAL_SOURCE_LABEL } from '@/lib/labels'
import { PROPOSAL_SOURCES, type ProposalSource } from '@/db/types'
import { hasRole } from '@/server/access'
import { listChapters } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { countImportBatches, listProposals, type ProposalView } from '@/server/proposals'
import { getWork } from '@/server/works'

// Source filters shown on this page. Manual proposals appear only under 전체.
const FILTER_SOURCES: ProposalSource[] = ['interview', 'import', 'post_chapter', 'style']

type Grouping = 'entity' | 'chapter'

function parseSource(value: string | undefined): ProposalSource | undefined {
  return PROPOSAL_SOURCES.find((source) => source === value)
}

function approvalsHref(workId: string, source: ProposalSource | undefined, grouping: Grouping) {
  const params = new URLSearchParams()
  if (source) params.set('source', source)
  if (grouping === 'chapter') params.set('group', 'chapter')
  const query = params.toString()
  return query ? `/works/${workId}/approvals?${query}` : `/works/${workId}/approvals`
}

function ReadOnlyProposals({ proposals }: { proposals: ProposalView[] }) {
  if (proposals.length === 0) {
    return <EmptyState title="승인 대기 중인 제안이 없어요." />
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-sm text-muted-ink">승인과 거절은 편집자만 할 수 있어요.</p>
      <ul className="wg-approvals-group">
        {proposals.map((proposal, index) => (
          <li
            key={proposal.id}
            className="wg-approvals-row"
            style={{ '--wg-approvals-entry-index': Math.min(index, 3) } as CSSProperties}
          >
            <span className="wg-approvals-line-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="wg-approvals-card">
              <ProposalDetails
                proposal={proposal}
                chapter={
                  proposal.chapterPosition !== null && (
                    <span>{chapterLabel(proposal.chapterPosition, proposal.chapterTitle)}</span>
                  )
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>
  searchParams: Promise<{ source?: string; group?: string }>
}) {
  const { workId } = await params
  const query = await searchParams
  const { db, actor } = await pageContext(`/works/${workId}/approvals`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const canEdit = hasRole(work.role, 'editor')

  const source = parseSource(query.source)
  const grouping: Grouping = query.group === 'chapter' ? 'chapter' : 'entity'

  const proposals = await guardPage(() => listProposals(db, actor, workId, { source }))
  const chapters = await guardPage(() => listChapters(db, actor, workId))
  const chapterOptions: ProposalChapterOption[] = chapters.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
  }))

  // Import batches: one banner per import job that still has pending proposals.
  const showBanners = source === undefined || source === 'import'
  const batches =
    canEdit && showBanners ? await guardPage(() => countImportBatches(db, actor, workId)) : []

  const sourceOptions: FilterOption[] = [
    { label: '전체', href: approvalsHref(workId, undefined, grouping), active: !source },
    ...FILTER_SOURCES.map((value) => ({
      label: PROPOSAL_SOURCE_LABEL[value],
      href: approvalsHref(workId, value, grouping),
      active: source === value,
    })),
  ]
  const groupOptions: FilterOption[] = [
    {
      label: '카드별',
      href: approvalsHref(workId, source, 'entity'),
      active: grouping === 'entity',
    },
    {
      label: '회차별',
      href: approvalsHref(workId, source, 'chapter'),
      active: grouping === 'chapter',
    },
  ]

  return (
    <div className="wg-approvals-page">
      <PageHeader
        title="승인 대기"
        description="AI가 찾은 설정 후보와 가져온 원고에서 나온 제안이에요. 승인한 것만 위키에 들어가요."
      />

      <div className="wg-approvals-filters">
        <FilterLinks label="출처" options={sourceOptions} />
        <FilterLinks label="묶음" options={groupOptions} />
      </div>

      {canEdit ? (
        <ProposalList
          key={`${source ?? 'all'}-${grouping}`}
          proposals={proposals}
          workId={workId}
          chapters={chapterOptions}
          grouping={grouping}
          importBatches={batches}
          selectable
        />
      ) : (
        <ReadOnlyProposals proposals={proposals} />
      )}
    </div>
  )
}
