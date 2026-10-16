import Link from 'next/link'
import { chapterLabel, SOURCE_TYPE_LABEL } from '@/lib/labels'
import type { FactSourceType } from '@/db/types'

type SourceLabelProps = {
  workId: string
  sourceType: FactSourceType
  chapter: { id: string; position: number; title: string } | null
}

/** Where a fact came from: a link to its chapter, or the source type name. */
export function SourceLabel({ workId, sourceType, chapter }: SourceLabelProps) {
  if (sourceType === 'chapter' && chapter) {
    return (
      <Link
        href={`/works/${workId}/chapters/${chapter.id}`}
        className="underline underline-offset-4"
      >
        {chapterLabel(chapter.position, chapter.title)}
      </Link>
    )
  }
  return <span>{SOURCE_TYPE_LABEL[sourceType]}</span>
}
