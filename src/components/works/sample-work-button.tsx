'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PopButton } from '@/components/motion'
import { runAction } from '@/lib/client/run-action'
import { createSampleWorkAction } from '@/server/actions/sample-work'

/** One-click demo work: builds the sample and opens chapter 3 with the auto check. */
export function SampleWorkButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    try {
      const result = await runAction(createSampleWorkAction(), {
        success: '샘플 작품을 만들었어요.',
      })
      if (result) {
        // Stay pending: the page is navigating away, and a second click would build another work.
        router.push(`/works/${result.workId}/chapters/${result.chapterId}?demo=1`)
        return
      }
    } catch {
      // Fall through and let the author try again.
    }
    setPending(false)
  }

  return (
    <PopButton
      className="wg-works-sample"
      pending={pending}
      pendingLabel={
        <>
          만드는 중…
          <span className="wg-works-sample-cells" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </>
      }
      onClick={() => void onClick()}
    >
      샘플 작품으로 체험하기
    </PopButton>
  )
}
