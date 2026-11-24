'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary for app pages. Sits inside AppLayout, so the top bar stays visible.
// The raw message is never shown: production builds redact it. The digest is logged for debugging.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="b-wrap wg-auth-status">
      <p className="b-subhead">페이지를 불러오지 못했어요</p>
      <p className="b-label b-muted">잠시 후 다시 시도해 주세요.</p>
      <div className="b-stack">
        <Button onClick={() => retry()}>다시 시도</Button>
        <Link href="/works" className="b-link b-control inline-flex min-h-11 items-center">
          내 작품으로 가기
        </Link>
      </div>
    </div>
  )
}
