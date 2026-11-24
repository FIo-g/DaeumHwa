import Link from 'next/link'
import { SOURCE_TYPE_LABEL } from '@/lib/labels'
import type { FactSourceType } from '@/db/types'
import { ChapterCaption } from './chapter-caption'

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
        className="wg-shell-source wg-shell-source-link"
      >
        <ChapterCaption {...chapter} />
      </Link>
    )
  }
  return <span className="wg-shell-source">{SOURCE_TYPE_LABEL[sourceType]}</span>
}
