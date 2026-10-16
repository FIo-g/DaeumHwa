'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmButton } from '@/components/app/confirm-button'
import { runAction } from '@/lib/client/run-action'
import { bulkApproveAction } from '@/server/actions/proposals'

type ImportBatchBannerProps = {
  workId: string
  /** The import job id that the batch's proposals share. */
  sourceRef: string
  count: number
}

/** One import batch: approves all of its pending proposals with their suggested tags. */
export function ImportBatchBanner({ workId, sourceRef, count }: ImportBatchBannerProps) {
  const router = useRouter()

  async function approveAll() {
    const data = await runAction(bulkApproveAction({ workId, sourceRef }))
    if (data) {
      if (data.approved > 0) toast.success(`${data.approved}건을 승인했습니다.`)
      if (data.failed.length > 0) toast.error(`${data.failed.length}건은 승인하지 못했습니다.`)
    }
    router.refresh()
  }

  return (
    <section
      aria-label="원고 가져오기 제안"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <p className="font-medium">원고 가져오기 제안 {count}건</p>
      <ConfirmButton
        title={`제안 ${count}건을 모두 승인할까요?`}
        description="기본 태그가 붙고 위키에 바로 반영됩니다."
        confirmLabel="승인"
        onConfirm={approveAll}
      >
        이 가져오기의 제안 모두 승인
      </ConfirmButton>
    </section>
  )
}
