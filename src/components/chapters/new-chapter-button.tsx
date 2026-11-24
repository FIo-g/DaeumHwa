'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PopButton } from '@/components/motion'
import { runAction } from '@/lib/client/run-action'
import { createChapterAction } from '@/server/actions/chapters'

/** Creates the next chapter of a work at the end of the list, then refreshes the page. */
export function NewChapterButton({ workId }: { workId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    try {
      const chapter = await runAction(createChapterAction({ workId }), {
        success: '새 회차를 만들었어요.',
      })
      if (chapter) router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <PopButton onClick={onClick} pending={pending} pendingLabel="만드는 중…">
      새 회차
    </PopButton>
  )
}
