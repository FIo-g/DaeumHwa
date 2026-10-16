import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ResumePoint } from '@/server/user-state'
import { chapterLabel } from '@/lib/labels'

/** Top banner on the works list: jumps back to the chapter the user left off in. */
export function ResumeBanner({ resume }: { resume: ResumePoint }) {
  const href =
    resume.chapterId !== null
      ? `/works/${resume.workId}/chapters/${resume.chapterId}`
      : `/works/${resume.workId}`
  const chapter =
    resume.chapterPosition !== null
      ? ` · ${chapterLabel(resume.chapterPosition, resume.chapterTitle)}`
      : ''

  return (
    <Link
      href={href}
      className="mb-6 flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted"
    >
      <span className="min-w-0 truncate">
        이어서 쓰기: {resume.workTitle}
        {chapter}
      </span>
      <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
    </Link>
  )
}
