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
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <EmptyState
        title="문제가 발생했습니다"
        description="잠시 후 다시 시도해 주세요. 계속되면 작품 목록으로 돌아가세요."
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
