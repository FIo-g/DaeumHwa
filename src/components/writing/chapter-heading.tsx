import { PageHeader } from '@/components/app/page-header'

export function ChapterHeading({ title, workTitle }: { title: string; workTitle: string }) {
  return (
    <div className="wg-writing-heading">
      <PageHeader title={title} description={workTitle} />
    </div>
  )
}
