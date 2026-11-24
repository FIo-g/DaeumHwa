import { redirect } from 'next/navigation'
import { PageEdge } from '@/components/app/page-header'
import { GridTitle } from '@/components/motion'
import { NewWorkForm } from '@/components/works/new-work-form'
import { requirePageUser } from '@/server/session'

export default async function NewWorkPage() {
  const user = await requirePageUser('/works/new')
  if (user.isAnonymous) redirect('/signup?next=/works/new')
  return (
    <div className="b-wrap wg-works-page wg-works-new">
      <header className="wg-works-header">
        <PageEdge className="mb-2" />
        <GridTitle as="h1" size="page" columns={4}>
          새 작품
        </GridTitle>
        <p className="b-lede b-muted wg-works-new-description">제목만 정해도 시작할 수 있어요.</p>
      </header>
      <NewWorkForm />
    </div>
  )
}
