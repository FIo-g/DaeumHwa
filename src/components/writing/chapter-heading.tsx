import { GridTitle } from '@/components/motion'

export function ChapterHeading({ title, workTitle }: { title: string; workTitle: string }) {
  const length = Array.from(title).length

  return (
    <header className="wg-writing-heading">
      <div className="b-edge" aria-hidden="true">
        20×10
      </div>
      <p className="text-sm">{workTitle}</p>
      <GridTitle as="h1" size="page" columns={length <= 9 ? length : undefined}>
        {title}
      </GridTitle>
    </header>
  )
}
