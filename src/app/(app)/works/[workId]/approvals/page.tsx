import { FilterLinks, type FilterOption } from '@/components/history/filter-links'
import { PageHeader } from '@/components/app/page-header'
import type { ProposalChapterOption } from '@/components/proposals/proposal-card'
import { ProposalList } from '@/components/proposals/proposal-list'
import { PROPOSAL_SOURCE_LABEL } from '@/lib/labels'
import { PROPOSAL_SOURCES, type ProposalSource } from '@/db/types'
import { hasRole } from '@/server/access'
import { listChapters } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { listProposals } from '@/server/proposals'
import { getWork } from '@/server/works'
import { ImportBatchBanner } from './import-batch-banner'
import { ReadOnlyProposals } from './read-only-proposals'

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
  const importProposals = canEdit
    ? await guardPage(() => listProposals(db, actor, workId, { source: 'import' }))
    : []
  const batches = new Map<string, number>()
  for (const proposal of importProposals) {
    if (!proposal.sourceRef) continue
    batches.set(proposal.sourceRef, (batches.get(proposal.sourceRef) ?? 0) + 1)
  }
  const showBanners = source === undefined || source === 'import'

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="승인 대기"
        description="AI와 가져오기가 만든 제안을 확인하고 위키에 반영합니다."
      />

      <div className="flex flex-col gap-3">
        <FilterLinks label="출처" options={sourceOptions} />
        <FilterLinks label="묶음" options={groupOptions} />
      </div>

      {canEdit &&
        showBanners &&
        [...batches.entries()].map(([sourceRef, count]) => (
          <ImportBatchBanner key={sourceRef} workId={workId} sourceRef={sourceRef} count={count} />
        ))}

      {canEdit ? (
        <ProposalList
          key={`${source ?? 'all'}-${grouping}`}
          proposals={proposals}
          workId={workId}
          chapters={chapterOptions}
          grouping={grouping}
          selectable
        />
      ) : (
        <ReadOnlyProposals proposals={proposals} />
      )}
    </div>
  )
}
