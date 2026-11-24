import { PopLink } from '@/components/motion'
import type { ResumePoint } from '@/server/user-state'
import { chapterLabel } from '@/lib/labels'

export function ResumeBanner({ resume, trial }: { resume: ResumePoint; trial?: boolean }) {
  const base = `/works/${resume.workId}`
  const href = resume.chapterId !== null ? `${base}/chapters/${resume.chapterId}` : base
  const chapter =
    resume.chapterPosition !== null
      ? chapterLabel(resume.chapterPosition, resume.chapterTitle)
      : null

  return (
    <div className="wg-works-resume">
      <div className="min-w-0 flex-1">
        <p className="b-subhead wrap-anywhere">{resume.workTitle}</p>
        {chapter && <p className="b-label mt-1 wrap-anywhere">{chapter}</p>}
      </div>
      <PopLink
        href={href}
        variant="flat"
        aria-label={`${trial ? '이어서 보기' : '이어서 쓰기'}: ${resume.workTitle}${chapter ? ` · ${chapter}` : ''}`}
      >
        {trial ? '이어서 보기' : '이어서 쓰기'}
      </PopLink>
    </div>
  )
}
