'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { runAction } from '@/lib/client/run-action'
import { createSampleWorkAction } from '@/server/actions/sample-work'

type SampleWorkButtonProps = {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
}

/** One-click demo work: builds the sample and opens chapter 3 with the auto check. */
export function SampleWorkButton({ variant = 'default' }: SampleWorkButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    try {
      const result = await runAction(createSampleWorkAction(), {
        success: '샘플 작품을 만들었습니다.',
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
    <Button variant={variant} disabled={pending} onClick={() => void onClick()}>
      {pending ? '만드는 중…' : '샘플 작품으로 체험하기'}
    </Button>
  )
}
