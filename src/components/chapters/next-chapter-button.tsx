'use client'

import { PenLineIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { runAction } from '@/lib/client/run-action'
import { openNextChapterAction } from '@/server/actions/chapters'

/**
 * Opens the newest draft chapter, or creates the next chapter when there is no draft,
 * then moves to its writing screen.
 */
export function NextChapterButton({ workId }: { workId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    try {
      const opened = await runAction(openNextChapterAction({ workId }))
      if (opened) router.push(`/works/${workId}/chapters/${opened.chapterId}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      <PenLineIcon aria-hidden="true" />
      다음 화 쓰기
    </Button>
  )
}
