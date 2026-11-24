import '@/app/styles/b-works.css'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { NewWorkForm } from '@/components/works/new-work-form'
import { requirePageUser } from '@/server/session'

export default async function NewWorkPage() {
  const user = await requirePageUser('/works/new')
  if (user.isAnonymous) redirect('/signup?next=/works/new')
  return (
    <div className="b-works-new b-wrap">
      <PageHeader title="새 작품" description="제목만 정해도 시작할 수 있어요." band="kraft" />
      <NewWorkForm />
    </div>
  )
}
