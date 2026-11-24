'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Button, buttonVariants } from '@/components/ui/button'

// Error boundary for app pages. Sits inside AppLayout, so the top bar stays visible.
// The raw message is never shown: production builds redact it. The digest is logged for debugging.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="b-band b-band--apricot flex flex-1 justify-center px-edge [&>*]:w-full [&>*]:max-w-lg">
      <EmptyState
        title="페이지를 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>다시 시도</Button>
            <Link href="/works" className={buttonVariants({ variant: 'outline' })}>
              내 작품으로 가기
            </Link>
          </div>
        }
      />
    </div>
  )
}
