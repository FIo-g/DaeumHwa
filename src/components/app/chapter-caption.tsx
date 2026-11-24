import { stripEpisodePrefix } from '@/lib/labels'

export function ChapterCaption({ position, title }: { position: number; title: string }) {
  const chapterTitle = stripEpisodePrefix(title, position)
  return (
    <span>
      <span className="font-mono">{position}화</span>
      {chapterTitle && (
        <>
          {' '}
          <span className="font-heading">{chapterTitle}</span>
        </>
      )}
    </span>
  )
}
